import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, inventoryItemsTable, transactionsTable, syncLogsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { UploadExcelResponse, GetLastSyncResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ];
    if (
      allowed.includes(file.mimetype) ||
      file.originalname.endsWith(".xlsx") ||
      file.originalname.endsWith(".xls") ||
      file.originalname.endsWith(".csv")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only Excel (.xlsx, .xls) and CSV files are allowed"));
    }
  },
});

interface ExcelRow {
  name?: string;
  Name?: string;
  category?: string;
  Category?: string;
  sku?: string;
  SKU?: string;
  quantity?: number | string;
  Quantity?: number | string;
  qty?: number | string;
  Qty?: number | string;
  unit?: string;
  Unit?: string;
  min_quantity?: number | string;
  minQuantity?: number | string;
  "Min Quantity"?: number | string;
  unit_price?: number | string;
  unitPrice?: number | string;
  "Unit Price"?: number | string;
  price?: number | string;
  Price?: number | string;
  supplier?: string;
  Supplier?: string;
  location?: string;
  Location?: string;
  description?: string;
  Description?: string;
  [key: string]: unknown;
}

function getField(row: ExcelRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = row[key];
    if (val != null && val !== "") return String(val).trim();
  }
  return null;
}

function getNumericField(row: ExcelRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const val = row[key];
    if (val != null && val !== "") {
      const num = Number(val);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

router.post(
  "/upload/excel",
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const fileName = req.file.originalname;
    const errors: string[] = [];
    let itemsAdded = 0;
    let itemsUpdated = 0;
    let itemsRemoved = 0;

    try {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        res.status(400).json({ error: "Excel file has no sheets" });
        return;
      }
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, {
        defval: null,
        raw: false,
      });

      if (rows.length === 0) {
        res.status(400).json({ error: "Excel file has no data rows" });
        return;
      }

      const seenSkus = new Set<string>();
      const processedItems: {
        name: string;
        category: string | null;
        sku: string | null;
        quantity: string;
        unit: string | null;
        minQuantity: string | null;
        unitPrice: string | null;
        supplier: string | null;
        location: string | null;
        description: string | null;
      }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        const name = getField(row, "name", "Name", "item", "Item", "material", "Material", "product", "Product");
        if (!name) {
          errors.push(`Row ${rowNum}: Missing item name`);
          continue;
        }

        const sku = getField(row, "sku", "SKU", "code", "Code", "id", "ID");
        if (sku) seenSkus.add(sku);

        const quantityVal = getNumericField(row, "quantity", "Quantity", "qty", "Qty", "stock", "Stock");
        const quantity = String(quantityVal ?? 0);

        processedItems.push({
          name,
          category: getField(row, "category", "Category", "type", "Type", "group", "Group"),
          sku,
          quantity,
          unit: getField(row, "unit", "Unit", "uom", "UOM"),
          minQuantity: (() => {
            const v = getNumericField(row, "min_quantity", "minQuantity", "Min Quantity", "minimum", "Minimum", "reorder", "Reorder");
            return v != null ? String(v) : null;
          })(),
          unitPrice: (() => {
            const v = getNumericField(row, "unit_price", "unitPrice", "Unit Price", "price", "Price", "cost", "Cost");
            return v != null ? String(v) : null;
          })(),
          supplier: getField(row, "supplier", "Supplier", "vendor", "Vendor"),
          location: getField(row, "location", "Location", "warehouse", "Warehouse", "bin", "Bin"),
          description: getField(row, "description", "Description", "notes", "Notes", "remarks", "Remarks"),
        });
      }

      const existingItems = await db.select().from(inventoryItemsTable);
      const existingBySku = new Map<string, typeof existingItems[0]>();
      const existingByName = new Map<string, typeof existingItems[0]>();
      for (const item of existingItems) {
        if (item.sku) existingBySku.set(item.sku, item);
        existingByName.set(item.name.toLowerCase(), item);
      }

      const updatedItemIds = new Set<number>();

      for (const itemData of processedItems) {
        let existing = itemData.sku ? existingBySku.get(itemData.sku) : undefined;
        if (!existing) {
          existing = existingByName.get(itemData.name.toLowerCase());
        }

        if (existing) {
          const oldQty = Number(existing.quantity);
          const newQty = Number(itemData.quantity);
          const qtyChange = newQty - oldQty;

          await db
            .update(inventoryItemsTable)
            .set({
              ...itemData,
              lastUpdated: new Date(),
            })
            .where(eq(inventoryItemsTable.id, existing.id));

          updatedItemIds.add(existing.id);

          if (Math.abs(qtyChange) > 0.001) {
            const txType = qtyChange > 0 ? "added" : "consumed";
            await db.insert(transactionsTable).values({
              itemId: existing.id,
              itemName: itemData.name,
              type: txType,
              quantityChange: String(Math.abs(qtyChange)),
              previousQuantity: String(oldQty),
              newQuantity: String(newQty),
              notes: "Updated via Excel upload",
            });
          }

          itemsUpdated++;
        } else {
          const [newItem] = await db
            .insert(inventoryItemsTable)
            .values({
              ...itemData,
              lastUpdated: new Date(),
            })
            .returning();

          updatedItemIds.add(newItem.id);

          await db.insert(transactionsTable).values({
            itemId: newItem.id,
            itemName: itemData.name,
            type: "added",
            quantityChange: itemData.quantity,
            previousQuantity: "0",
            newQuantity: itemData.quantity,
            notes: "Added via Excel upload",
          });

          itemsAdded++;
        }
      }

      const itemsProcessed = processedItems.length;

      await db.insert(syncLogsTable).values({
        fileName,
        itemsProcessed,
        itemsAdded,
        itemsUpdated,
        itemsRemoved,
        syncedAt: new Date(),
      });

      const result = {
        success: true,
        message: `Successfully synced ${itemsProcessed} items from ${fileName}`,
        itemsProcessed,
        itemsAdded,
        itemsUpdated,
        itemsRemoved,
        errors,
        syncedAt: new Date().toISOString(),
      };

      res.json(UploadExcelResponse.parse(result));
    } catch (err) {
      logger.error({ err }, "Excel upload error");
      res.status(400).json({
        success: false,
        message: "Failed to process Excel file",
        error: String(err),
      });
    }
  }
);

router.get("/upload/last-sync", async (_req, res): Promise<void> => {
  const [lastSync] = await db
    .select()
    .from(syncLogsTable)
    .orderBy(desc(syncLogsTable.syncedAt))
    .limit(1);

  if (!lastSync) {
    res.json(GetLastSyncResponse.parse({ syncedAt: null, fileName: null, itemsProcessed: null }));
    return;
  }

  res.json(
    GetLastSyncResponse.parse({
      syncedAt: lastSync.syncedAt.toISOString(),
      fileName: lastSync.fileName,
      itemsProcessed: lastSync.itemsProcessed,
    })
  );
});

export default router;
