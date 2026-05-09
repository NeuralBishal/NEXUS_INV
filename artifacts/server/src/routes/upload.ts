import { Router, Request, Response, NextFunction } from "express";
import { db, inventoryItemsTable, syncLogsTable, transactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { parseExcelBuffer } from "../lib/excel.js";

export const uploadRouter = Router();

uploadRouter.post(
  "/upload/excel",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const buffer = req.body as Buffer;

      if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        res.status(400).json({
          success: false,
          message: "No file data received. Send the Excel file as a raw binary body.",
          itemsProcessed: 0,
          itemsAdded: 0,
          itemsUpdated: 0,
          itemsRemoved: 0,
          errors: [],
          syncedAt: new Date().toISOString(),
        });
        return;
      }

      const { items: excelItems, errors: parseErrors } = parseExcelBuffer(buffer);

      if (excelItems.length === 0 && parseErrors.length > 0) {
        res.status(400).json({
          success: false,
          message: "Failed to parse Excel file",
          itemsProcessed: 0,
          itemsAdded: 0,
          itemsUpdated: 0,
          itemsRemoved: 0,
          errors: parseErrors,
          syncedAt: new Date().toISOString(),
        });
        return;
      }

      const existingItems = await db.select().from(inventoryItemsTable);
      const existingByName = new Map(existingItems.map((i) => [i.name.toLowerCase(), i]));
      const existingBySku = new Map(
        existingItems.filter((i) => i.sku).map((i) => [i.sku!.toLowerCase(), i]),
      );

      let itemsAdded = 0;
      let itemsUpdated = 0;
      const syncErrors: string[] = [...parseErrors];
      const seenIds = new Set<number>();

      for (const excelItem of excelItems) {
        try {
          const existing =
            (excelItem.sku ? existingBySku.get(excelItem.sku.toLowerCase()) : undefined) ??
            existingByName.get(excelItem.name.toLowerCase());

          if (existing) {
            seenIds.add(existing.id);
            const prevQty = parseFloat(existing.quantity ?? "0");
            const newQty = parseFloat(excelItem.quantity ?? "0");

            await db
              .update(inventoryItemsTable)
              .set({
                ...excelItem,
                lastUpdated: new Date(),
              })
              .where(eq(inventoryItemsTable.id, existing.id));

            await db.insert(transactionsTable).values({
              itemId: existing.id,
              itemName: excelItem.name,
              type: "updated",
              quantityChange: String(newQty - prevQty),
              previousQuantity: String(prevQty),
              newQuantity: String(newQty),
              notes: "Updated via Excel sync",
            });

            itemsUpdated++;
          } else {
            const [inserted] = await db
              .insert(inventoryItemsTable)
              .values(excelItem)
              .returning();

            if (inserted) {
              seenIds.add(inserted.id);

              await db.insert(transactionsTable).values({
                itemId: inserted.id,
                itemName: excelItem.name,
                type: "added",
                quantityChange: excelItem.quantity ?? "0",
                previousQuantity: "0",
                newQuantity: excelItem.quantity ?? "0",
                notes: "Added via Excel sync",
              });
            }

            itemsAdded++;
          }
        } catch (err) {
          syncErrors.push(
            `Failed to process item "${excelItem.name}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const toRemove = existingItems.filter((i) => !seenIds.has(i.id));
      let itemsRemoved = 0;

      for (const item of toRemove) {
        try {
          await db.insert(transactionsTable).values({
            itemId: item.id,
            itemName: item.name,
            type: "consumed",
            quantityChange: `-${item.quantity}`,
            previousQuantity: item.quantity ?? "0",
            newQuantity: "0",
            notes: "Removed via Excel sync",
          });

          await db
            .delete(inventoryItemsTable)
            .where(eq(inventoryItemsTable.id, item.id));

          itemsRemoved++;
        } catch (err) {
          syncErrors.push(
            `Failed to remove item "${item.name}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const fileName = req.headers["x-filename"]
        ? String(req.headers["x-filename"])
        : null;

      await db.insert(syncLogsTable).values({
        fileName,
        itemsProcessed: excelItems.length,
        itemsAdded,
        itemsUpdated,
        itemsRemoved,
      });

      const syncedAt = new Date().toISOString();

      res.json({
        success: true,
        message: `Sync complete: ${itemsAdded} added, ${itemsUpdated} updated, ${itemsRemoved} removed`,
        itemsProcessed: excelItems.length,
        itemsAdded,
        itemsUpdated,
        itemsRemoved,
        errors: syncErrors,
        syncedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

uploadRouter.get(
  "/upload/last-sync",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const [lastSync] = await db
        .select()
        .from(syncLogsTable)
        .orderBy(sql`synced_at desc`)
        .limit(1);

      if (!lastSync) {
        res.json({ syncedAt: null, fileName: null, itemsProcessed: null });
        return;
      }

      res.json({
        syncedAt: lastSync.syncedAt.toISOString(),
        fileName: lastSync.fileName ?? null,
        itemsProcessed: lastSync.itemsProcessed,
      });
    } catch (err) {
      next(err);
    }
  },
);
