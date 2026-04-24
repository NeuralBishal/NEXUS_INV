import { Router, type IRouter } from "express";
import { db, inventoryItemsTable, transactionsTable } from "@workspace/db";
import { ilike, eq, lte, isNotNull, desc, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import {
  GetInventoryItemParams,
  GetInventoryItemResponse,
  GetInventoryStatsResponse,
  ListInventoryItemsQueryParams,
  ListInventoryItemsResponse,
  ListTransactionsResponse,
  GetLowStockItemsResponse,
  ListCategoriesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseItem(item: (typeof inventoryItemsTable.$inferSelect)) {
  return {
    ...item,
    quantity: Number(item.quantity),
    minQuantity: item.minQuantity != null ? Number(item.minQuantity) : null,
    unitPrice: item.unitPrice != null ? Number(item.unitPrice) : null,
    lastUpdated: item.lastUpdated.toISOString(),
    createdAt: item.createdAt.toISOString(),
  };
}

function parseTransaction(t: (typeof transactionsTable.$inferSelect)) {
  return {
    ...t,
    quantityChange: Number(t.quantityChange),
    previousQuantity: Number(t.previousQuantity),
    newQuantity: Number(t.newQuantity),
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/inventory", async (req, res): Promise<void> => {
  const parsed = ListInventoryItemsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { category, search, lowStock } = parsed.data;

  let query = db.select().from(inventoryItemsTable).$dynamic();

  const conditions = [];
  if (category) {
    conditions.push(eq(inventoryItemsTable.category, category));
  }
  if (search) {
    conditions.push(ilike(inventoryItemsTable.name, `%${search}%`));
  }
  if (lowStock === "true") {
    conditions.push(
      sql`(${inventoryItemsTable.minQuantity} IS NOT NULL AND ${inventoryItemsTable.quantity}::numeric <= ${inventoryItemsTable.minQuantity}::numeric) OR (${inventoryItemsTable.minQuantity} IS NULL AND ${inventoryItemsTable.quantity}::numeric <= 5)`
    );
  }

  if (conditions.length > 0) {
    const { and } = await import("drizzle-orm");
    query = query.where(and(...conditions));
  }

  const items = await query.orderBy(inventoryItemsTable.name);
  res.json(ListInventoryItemsResponse.parse(items.map(parseItem)));
});

router.get("/inventory/stats", async (_req, res): Promise<void> => {
  const items = await db.select().from(inventoryItemsTable);

  const totalItems = items.length;
  const totalValue = items.reduce((sum, item) => {
    if (item.unitPrice != null) {
      return sum + Number(item.quantity) * Number(item.unitPrice);
    }
    return sum;
  }, 0);

  const lowStockCount = items.filter((item) => {
    if (item.minQuantity != null) {
      return Number(item.quantity) <= Number(item.minQuantity);
    }
    return Number(item.quantity) <= 5;
  }).length;

  const categories = new Set(items.map((i) => i.category).filter(Boolean)).size;

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentTx = await db
    .select()
    .from(transactionsTable)
    .where(sql`${transactionsTable.createdAt} >= ${oneDayAgo}`);

  const recentlyAdded = recentTx.filter((t) => t.type === "added").length;
  const recentlyConsumed = recentTx.filter((t) => t.type === "consumed").length;

  res.json(
    GetInventoryStatsResponse.parse({
      totalItems,
      totalValue,
      lowStockCount,
      categories,
      recentlyAdded,
      recentlyConsumed,
    })
  );
});

router.get("/inventory/categories", async (_req, res): Promise<void> => {
  const result = await db
    .selectDistinct({ category: inventoryItemsTable.category })
    .from(inventoryItemsTable)
    .where(isNotNull(inventoryItemsTable.category))
    .orderBy(inventoryItemsTable.category);

  const categories = result
    .map((r) => r.category)
    .filter((c): c is string => c != null);
  res.json(ListCategoriesResponse.parse(categories));
});

router.get("/inventory/low-stock", async (_req, res): Promise<void> => {
  const items = await db.select().from(inventoryItemsTable);
  const lowStockItems = items.filter((item) => {
    if (item.minQuantity != null) {
      return Number(item.quantity) <= Number(item.minQuantity);
    }
    return Number(item.quantity) <= 5;
  });
  res.json(GetLowStockItemsResponse.parse(lowStockItems.map(parseItem)));
});

router.get("/inventory/transactions", async (_req, res): Promise<void> => {
  const transactions = await db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(100);
  res.json(ListTransactionsResponse.parse(transactions.map(parseTransaction)));
});

router.get("/inventory/export.xlsx", async (_req, res): Promise<void> => {
  const items = await db.select().from(inventoryItemsTable).orderBy(inventoryItemsTable.category, inventoryItemsTable.name);

  // Group by category — one sheet per category, like the original Excel structure
  const byCategory = new Map<string, typeof items>();
  for (const item of items) {
    const cat = item.category || "Uncategorized";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(item);
  }

  const workbook = XLSX.utils.book_new();

  // "All Items" master sheet first
  const masterRows = items.map((it) => ({
    SKU: it.sku || "",
    Description: it.name,
    Category: it.category || "",
    Quantity: Number(it.quantity),
    Unit: it.unit || "",
    "Min Quantity": it.minQuantity != null ? Number(it.minQuantity) : "",
    "Unit Price (INR)": it.unitPrice != null ? Number(it.unitPrice) : "",
    "Total Value (INR)": it.unitPrice != null ? Number(it.quantity) * Number(it.unitPrice) : "",
    Location: it.location || "",
    Supplier: it.supplier || "",
    Description_Notes: it.description || "",
    "Last Updated": it.lastUpdated.toISOString(),
  }));
  const masterSheet = XLSX.utils.json_to_sheet(masterRows);
  XLSX.utils.book_append_sheet(workbook, masterSheet, "All Items");

  // Then a sheet per category — Excel sheet names max 31 chars, no special chars
  const sanitizeSheetName = (name: string) => name.replace(/[\\/?*[\]:]/g, "_").slice(0, 31);
  const usedNames = new Set<string>(["All Items"]);
  for (const [category, catItems] of byCategory) {
    let sheetName = sanitizeSheetName(category) || "Sheet";
    let suffix = 1;
    while (usedNames.has(sheetName)) {
      sheetName = sanitizeSheetName(category).slice(0, 28) + "_" + suffix++;
    }
    usedNames.add(sheetName);

    const rows = catItems.map((it) => ({
      SKU: it.sku || "",
      Description: it.name,
      Quantity: Number(it.quantity),
      Unit: it.unit || "",
      "Min Quantity": it.minQuantity != null ? Number(it.minQuantity) : "",
      "Unit Price (INR)": it.unitPrice != null ? Number(it.unitPrice) : "",
      Location: it.location || "",
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = `inventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
});

router.get("/inventory/:id", async (req, res): Promise<void> => {
  const params = GetInventoryItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [item] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, params.data.id));

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  res.json(GetInventoryItemResponse.parse(parseItem(item)));
});

router.patch("/inventory/:id", async (req, res): Promise<void> => {
  const params = GetInventoryItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(inventoryItemsTable)
    .where(eq(inventoryItemsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  const body = req.body || {};
  const updates: Partial<typeof inventoryItemsTable.$inferInsert> = {};

  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (body.sku !== undefined) updates.sku = body.sku ? String(body.sku).trim() : null;
  if (body.category !== undefined) updates.category = body.category ? String(body.category).trim() : null;
  if (body.unit !== undefined) updates.unit = body.unit ? String(body.unit).trim() : null;
  if (body.location !== undefined) updates.location = body.location ? String(body.location).trim() : null;
  if (body.supplier !== undefined) updates.supplier = body.supplier ? String(body.supplier).trim() : null;
  if (body.description !== undefined) updates.description = body.description ? String(body.description).trim() : null;

  let qtyChanged = false;
  let oldQty = Number(existing.quantity);
  let newQty = oldQty;
  if (body.quantity !== undefined && body.quantity !== "" && body.quantity !== null) {
    const q = Number(body.quantity);
    if (Number.isFinite(q) && q >= 0) {
      newQty = q;
      updates.quantity = String(q);
      if (Math.abs(q - oldQty) > 0.001) qtyChanged = true;
    }
  }
  if (body.minQuantity !== undefined) {
    if (body.minQuantity === null || body.minQuantity === "") {
      updates.minQuantity = null;
    } else {
      const m = Number(body.minQuantity);
      if (Number.isFinite(m) && m >= 0) updates.minQuantity = String(m);
    }
  }
  if (body.unitPrice !== undefined) {
    if (body.unitPrice === null || body.unitPrice === "") {
      updates.unitPrice = null;
    } else {
      const p = Number(body.unitPrice);
      if (Number.isFinite(p) && p >= 0) updates.unitPrice = String(p);
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  updates.lastUpdated = new Date();

  const [updated] = await db
    .update(inventoryItemsTable)
    .set(updates)
    .where(eq(inventoryItemsTable.id, params.data.id))
    .returning();

  if (qtyChanged) {
    const txType = newQty > oldQty ? "added" : "consumed";
    await db.insert(transactionsTable).values({
      itemId: updated.id,
      itemName: updated.name,
      type: txType,
      quantityChange: String(Math.abs(newQty - oldQty)),
      previousQuantity: String(oldQty),
      newQuantity: String(newQty),
      notes: body.notes ? String(body.notes) : "Manual edit",
    });
  }

  res.json(GetInventoryItemResponse.parse(parseItem(updated)));
});

export default router;
