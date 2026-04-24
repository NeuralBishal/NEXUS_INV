import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db, inventoryItemsTable, transactionsTable, syncLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { UploadExcelResponse, GetLastSyncResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

// --- Smart column detection ---

const NAME_COLS = ["description", "desc", "item name", "item description", "material name", "material description", "product name", "part name", "part description", "details", "particulars", "name"];
const QTY_COLS = ["actual stock", "quantity", "qty", "stock", "available", "current stock", "closing stock", "balance"];
const UNIT_COLS = ["uom", "unit of measure", "unit"];
const PRICE_COLS = ["unit price", "price per unit", "rate", "unit cost", "mrp"];
const SKU_COLS = ["material code", "part number", "part no.", "part no", "sku", "item code", "product code", "item no.", "item no", "part#", "article no", "article code"];
const CATEGORY_COLS = ["category", "group", "department", "section", "equipment", "machine"];
const LOCATION_COLS = ["location", "bin", "shelf", "warehouse", "rack", "store", "area"];
const MIN_QTY_COLS = ["min quantity", "min qty", "minimum qty", "reorder level", "safety stock", "min stock"];
const CONSUMPTION_COLS = ["consumption", "consumed", "issued", "used"];

function matchCol(header: string, candidates: string[]): boolean {
  const h = header.toLowerCase().trim();
  return candidates.some(c => h === c || h.includes(c) || c.includes(h));
}

interface ColMap {
  name: number;
  qty: number;
  unit: number;
  price: number;
  sku: number;
  category: number;
  location: number;
  minQty: number;
  consumption: number;
}

function detectHeaders(headerRow: (string | null | undefined)[]): ColMap | null {
  const map: ColMap = { name: -1, qty: -1, unit: -1, price: -1, sku: -1, category: -1, location: -1, minQty: -1, consumption: -1 };

  // Count non-empty string values — a real header row has at least 2
  const validCells = headerRow.filter(h => h && typeof h === "string" && h.trim().length > 0);
  if (validCells.length < 2) return null;

  headerRow.forEach((h, i) => {
    if (!h || typeof h !== "string" || !h.trim()) return;
    // Check SKU first so "MATERIAL CODE" isn't mistaken for a name column
    if (map.sku === -1 && matchCol(h, SKU_COLS)) { map.sku = i; return; }
    if (map.name === -1 && matchCol(h, NAME_COLS)) { map.name = i; return; }
    if (map.qty === -1 && matchCol(h, QTY_COLS)) { map.qty = i; return; }
    if (map.unit === -1 && matchCol(h, UNIT_COLS)) { map.unit = i; return; }
    if (map.price === -1 && matchCol(h, PRICE_COLS)) { map.price = i; return; }
    if (map.category === -1 && matchCol(h, CATEGORY_COLS)) { map.category = i; return; }
    if (map.location === -1 && matchCol(h, LOCATION_COLS)) { map.location = i; return; }
    if (map.minQty === -1 && matchCol(h, MIN_QTY_COLS)) { map.minQty = i; return; }
    if (map.consumption === -1 && matchCol(h, CONSUMPTION_COLS)) { map.consumption = i; }
  });

  // Must at least find a name/description column
  return map.name !== -1 ? map : null;
}

/** Parse a quantity cell value like "3 NOS", "2  NOS", "35KG", "3", 3 */
function parseQuantity(val: unknown): number | null {
  if (val == null) return null;
  const str = String(val).replace(/[,\s]/g, " ").trim();
  // Extract leading number
  const match = str.match(/^[\d.]+/);
  if (match) {
    const n = parseFloat(match[0]);
    return isNaN(n) ? null : n;
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

function str(val: unknown): string | null {
  if (val == null || val === "") return null;
  const s = String(val).trim();
  return s || null;
}

interface ParsedItem {
  name: string;
  sku: string | null;
  category: string | null;
  quantity: string;
  unit: string | null;
  minQuantity: string | null;
  unitPrice: string | null;
  supplier: string | null;
  location: string | null;
  description: string | null;
  consumption: number | null;
}

function parseSheet(
  worksheet: XLSX.WorkSheet,
  sheetName: string
): { items: ParsedItem[]; errors: string[]; headerRowIndex: number } {
  const rawRows: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as (string | number | boolean | null)[][];

  const errors: string[] = [];
  const items: ParsedItem[] = [];

  if (!rawRows.length) return { items, errors, headerRowIndex: -1 };

  // Find header row: look for a row that has a recognisable name column
  let headerRowIndex = -1;
  let colMap: ColMap | null = null;
  for (let i = 0; i < Math.min(15, rawRows.length); i++) {
    const row = rawRows[i].map(c => (c != null ? String(c) : null));
    const detected = detectHeaders(row);
    if (detected) {
      headerRowIndex = i;
      colMap = detected;
      break;
    }
  }

  if (!colMap || headerRowIndex === -1) {
    errors.push(`Sheet "${sheetName}": Could not detect header row`);
    return { items, errors, headerRowIndex: -1 };
  }

  // Process data rows
  for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.every(c => c == null || c === "")) continue;

    const rawName = row[colMap.name];
    const name = str(rawName);
    if (!name) continue; // skip rows with no item name

    const quantity = parseQuantity(colMap.qty !== -1 ? row[colMap.qty] : null) ?? 0;
    const unit = colMap.unit !== -1 ? str(row[colMap.unit]) : null;
    const sku = colMap.sku !== -1 ? str(row[colMap.sku]) : null;
    const category = colMap.category !== -1 ? str(row[colMap.category]) : sheetName;
    const location = colMap.location !== -1 ? str(row[colMap.location]) : null;
    const price = colMap.price !== -1 ? parseQuantity(row[colMap.price]) : null;
    const minQty = colMap.minQty !== -1 ? parseQuantity(row[colMap.minQty]) : null;
    const consumption = colMap.consumption !== -1 ? parseQuantity(row[colMap.consumption]) : null;

    items.push({
      name,
      sku,
      category,
      quantity: String(quantity),
      unit,
      minQuantity: minQty != null ? String(minQty) : null,
      unitPrice: price != null ? String(price) : null,
      supplier: null,
      location,
      description: null,
      consumption,
    });
  }

  return { items, errors, headerRowIndex };
}

interface SyncResult {
  success: boolean;
  status: number;
  message: string;
  itemsProcessed: number;
  itemsAdded: number;
  itemsUpdated: number;
  itemsRemoved: number;
  errors: string[];
  syncedAt: string;
}

async function processWorkbookBuffer(buffer: Buffer, sourceName: string): Promise<SyncResult> {
  const allErrors: string[] = [];
  let itemsAdded = 0;
  let itemsUpdated = 0;
  const itemsRemoved = 0;
  let totalProcessed = 0;

  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });

    if (!workbook.SheetNames.length) {
      return {
        success: false,
        status: 400,
        message: "Excel file has no sheets",
        itemsProcessed: 0,
        itemsAdded: 0,
        itemsUpdated: 0,
        itemsRemoved: 0,
        errors: [],
        syncedAt: new Date().toISOString(),
      };
    }

    const allItems: (ParsedItem & { sheetName: string })[] = [];
    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const { items, errors } = parseSheet(worksheet, sheetName);
      allErrors.push(...errors);
      for (const item of items) allItems.push({ ...item, sheetName });
    }

    if (allItems.length === 0) {
      return {
        success: false,
        status: 400,
        message: "No inventory items found. Make sure your sheet has a column named Description, Name, or Item.",
        itemsProcessed: 0,
        itemsAdded: 0,
        itemsUpdated: 0,
        itemsRemoved: 0,
        errors: allErrors,
        syncedAt: new Date().toISOString(),
      };
    }

    const existingItems = await db.select().from(inventoryItemsTable);
    const existingBySku = new Map<string, typeof existingItems[0]>();
    const existingByName = new Map<string, typeof existingItems[0]>();
    for (const item of existingItems) {
      if (item.sku) existingBySku.set(item.sku.toLowerCase(), item);
      existingByName.set(item.name.toLowerCase(), item);
    }

    for (const itemData of allItems) {
      totalProcessed++;
      const skuKey = itemData.sku?.toLowerCase();
      let existing = skuKey ? existingBySku.get(skuKey) : undefined;
      if (!existing) existing = existingByName.get(itemData.name.toLowerCase());

      const { consumption, sheetName: _sheet, ...fields } = itemData;

      if (existing) {
        const oldQty = Number(existing.quantity);
        const newQty = Number(fields.quantity);
        const qtyChange = newQty - oldQty;

        await db.update(inventoryItemsTable).set({ ...fields, lastUpdated: new Date() }).where(eq(inventoryItemsTable.id, existing.id));

        if (Math.abs(qtyChange) > 0.001) {
          const txType = qtyChange > 0 ? "added" : "consumed";
          await db.insert(transactionsTable).values({
            itemId: existing.id, itemName: fields.name, type: txType,
            quantityChange: String(Math.abs(qtyChange)),
            previousQuantity: String(oldQty), newQuantity: String(newQty),
            notes: `Updated via ${sourceName}`,
          });
        }

        if (consumption && consumption > 0) {
          await db.insert(transactionsTable).values({
            itemId: existing.id, itemName: fields.name, type: "consumed",
            quantityChange: String(consumption),
            previousQuantity: String(newQty), newQuantity: String(Math.max(0, newQty - consumption)),
            notes: "Consumption recorded from sync",
          });
        }
        itemsUpdated++;
      } else {
        const [newItem] = await db.insert(inventoryItemsTable).values({ ...fields, lastUpdated: new Date() }).returning();
        await db.insert(transactionsTable).values({
          itemId: newItem.id, itemName: fields.name, type: "added",
          quantityChange: fields.quantity,
          previousQuantity: "0", newQuantity: fields.quantity,
          notes: `Added via ${sourceName}`,
        });
        itemsAdded++;
      }
    }

    await db.insert(syncLogsTable).values({
      fileName: sourceName, itemsProcessed: totalProcessed,
      itemsAdded, itemsUpdated, itemsRemoved, syncedAt: new Date(),
    });

    return {
      success: true,
      status: 200,
      message: `Synced ${totalProcessed} items from ${workbook.SheetNames.length} sheet(s) in ${sourceName}`,
      itemsProcessed: totalProcessed, itemsAdded, itemsUpdated, itemsRemoved,
      errors: allErrors,
      syncedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error({ err }, "Sync error");
    return {
      success: false,
      status: 400,
      message: "Failed to process file: " + String(err),
      itemsProcessed: 0, itemsAdded: 0, itemsUpdated: 0, itemsRemoved: 0,
      errors: [], syncedAt: new Date().toISOString(),
    };
  }
}

/** Convert various Google Sheets URL formats to an XLSX export URL. */
function googleSheetsToXlsxUrl(url: string): string | null {
  const trimmed = url.trim();
  // Match the spreadsheet ID from any standard share/edit URL
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  const sheetId = match[1];
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
}

router.post(
  "/upload/excel",
  upload.single("file"),
  async (req, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }
    const result = await processWorkbookBuffer(req.file.buffer, req.file.originalname);
    const { status, ...body } = result;
    if (status === 200) {
      res.json(UploadExcelResponse.parse(body));
    } else {
      res.status(status).json(body);
    }
  }
);

router.post("/upload/google-sheet", async (req, res): Promise<void> => {
  const { url } = req.body || {};
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "Missing 'url' in request body" });
    return;
  }

  const exportUrl = googleSheetsToXlsxUrl(url);
  if (!exportUrl) {
    res.status(400).json({
      success: false,
      message: "Not a valid Google Sheets URL. Paste the link from your browser's address bar while viewing the sheet.",
      itemsProcessed: 0, itemsAdded: 0, itemsUpdated: 0, itemsRemoved: 0,
      errors: [], syncedAt: new Date().toISOString(),
    });
    return;
  }

  try {
    const response = await fetch(exportUrl, { redirect: "follow" });
    if (!response.ok) {
      res.status(400).json({
        success: false,
        message: `Could not fetch Google Sheet (status ${response.status}). Make sure the sharing setting is "Anyone with the link can view".`,
        itemsProcessed: 0, itemsAdded: 0, itemsUpdated: 0, itemsRemoved: 0,
        errors: [], syncedAt: new Date().toISOString(),
      });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Quick sanity check — Google returns an HTML login page for private sheets
    const head = buffer.slice(0, 200).toString("utf-8").toLowerCase();
    if (head.includes("<html") || head.includes("<!doctype")) {
      res.status(400).json({
        success: false,
        message: "Google returned a login page. The sheet must be set to \"Anyone with the link can view\".",
        itemsProcessed: 0, itemsAdded: 0, itemsUpdated: 0, itemsRemoved: 0,
        errors: [], syncedAt: new Date().toISOString(),
      });
      return;
    }

    const result = await processWorkbookBuffer(buffer, "Google Sheets");
    const { status, ...body } = result;
    if (status === 200) {
      res.json(UploadExcelResponse.parse(body));
    } else {
      res.status(status).json(body);
    }
  } catch (err) {
    logger.error({ err }, "Google Sheets fetch error");
    res.status(400).json({
      success: false,
      message: "Failed to fetch Google Sheet: " + String(err),
      itemsProcessed: 0, itemsAdded: 0, itemsUpdated: 0, itemsRemoved: 0,
      errors: [], syncedAt: new Date().toISOString(),
    });
  }
});

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

  res.json(GetLastSyncResponse.parse({
    syncedAt: lastSync.syncedAt.toISOString(),
    fileName: lastSync.fileName,
    itemsProcessed: lastSync.itemsProcessed,
  }));
});

export default router;
