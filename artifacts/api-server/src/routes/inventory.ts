import { Router, type IRouter } from "express";
import { db, inventoryItemsTable, transactionsTable } from "@workspace/db";
import { ilike, eq, lte, isNotNull, desc, sql } from "drizzle-orm";
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

export default router;
