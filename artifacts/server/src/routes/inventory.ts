import { Router, Request, Response, NextFunction } from "express";
import {
  db,
  inventoryItemsTable,
  transactionsTable,
} from "@workspace/db";
import {
  and,
  eq,
  ilike,
  or,
  sql,
  desc,
  isNotNull,
  count,
  countDistinct,
} from "drizzle-orm";
import { ListInventoryItemsQueryParams, GetInventoryItemParams } from "@workspace/api-zod";
import { ApiError } from "../middleware/errorHandler.js";

export const inventoryRouter = Router();

function toNum(val: string | null | undefined): number | null {
  if (val == null) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function toNum0(val: string | null | undefined): number {
  return toNum(val) ?? 0;
}

function serializeItem(row: typeof inventoryItemsTable.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    category: row.category ?? null,
    sku: row.sku ?? null,
    quantity: toNum0(row.quantity),
    unit: row.unit ?? null,
    minQuantity: toNum(row.minQuantity),
    unitPrice: toNum(row.unitPrice),
    supplier: row.supplier ?? null,
    location: row.location ?? null,
    description: row.description ?? null,
    lastUpdated: row.lastUpdated.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeTransaction(row: typeof transactionsTable.$inferSelect) {
  return {
    id: row.id,
    itemId: row.itemId,
    itemName: row.itemName,
    type: row.type as "added" | "consumed" | "updated",
    quantityChange: toNum0(row.quantityChange),
    previousQuantity: toNum0(row.previousQuantity),
    newQuantity: toNum0(row.newQuantity),
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

inventoryRouter.get(
  "/inventory",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const query = ListInventoryItemsQueryParams.parse(req.query);

      const conditions = [];

      if (query.category) {
        conditions.push(eq(inventoryItemsTable.category, query.category));
      }

      if (query.search) {
        conditions.push(
          or(
            ilike(inventoryItemsTable.name, `%${query.search}%`),
            ilike(inventoryItemsTable.description, `%${query.search}%`),
            ilike(inventoryItemsTable.sku, `%${query.search}%`),
          ),
        );
      }

      if (query.lowStock === "true") {
        conditions.push(
          and(
            isNotNull(inventoryItemsTable.minQuantity),
            sql`${inventoryItemsTable.quantity}::numeric <= ${inventoryItemsTable.minQuantity}::numeric`,
          ),
        );
      }

      const items = await db
        .select()
        .from(inventoryItemsTable)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(inventoryItemsTable.name);

      res.json(items.map(serializeItem));
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.get(
  "/inventory/stats",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [totals] = await db
        .select({
          totalItems: count(),
          totalValue: sql<string>`coalesce(sum(${inventoryItemsTable.quantity}::numeric * coalesce(${inventoryItemsTable.unitPrice}::numeric, 0)), 0)`,
          lowStockCount: sql<string>`count(*) filter (where ${inventoryItemsTable.minQuantity} is not null and ${inventoryItemsTable.quantity}::numeric <= ${inventoryItemsTable.minQuantity}::numeric)`,
          categories: countDistinct(inventoryItemsTable.category),
        })
        .from(inventoryItemsTable);

      const [txStats] = await db
        .select({
          recentlyAdded: sql<string>`count(*) filter (where type = 'added' and created_at >= ${sevenDaysAgo})`,
          recentlyConsumed: sql<string>`count(*) filter (where type = 'consumed' and created_at >= ${sevenDaysAgo})`,
        })
        .from(transactionsTable);

      res.json({
        totalItems: totals?.totalItems ?? 0,
        totalValue: parseFloat(totals?.totalValue ?? "0"),
        lowStockCount: parseInt(totals?.lowStockCount ?? "0", 10),
        categories: totals?.categories ?? 0,
        recentlyAdded: parseInt(txStats?.recentlyAdded ?? "0", 10),
        recentlyConsumed: parseInt(txStats?.recentlyConsumed ?? "0", 10),
      });
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.get(
  "/inventory/categories",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const rows = await db
        .selectDistinct({ category: inventoryItemsTable.category })
        .from(inventoryItemsTable)
        .where(isNotNull(inventoryItemsTable.category))
        .orderBy(inventoryItemsTable.category);

      res.json(rows.map((r) => r.category).filter(Boolean));
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.get(
  "/inventory/low-stock",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const items = await db
        .select()
        .from(inventoryItemsTable)
        .where(
          and(
            isNotNull(inventoryItemsTable.minQuantity),
            sql`${inventoryItemsTable.quantity}::numeric <= ${inventoryItemsTable.minQuantity}::numeric`,
          ),
        )
        .orderBy(inventoryItemsTable.name);

      res.json(items.map(serializeItem));
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.get(
  "/inventory/transactions",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const transactions = await db
        .select()
        .from(transactionsTable)
        .orderBy(desc(transactionsTable.createdAt))
        .limit(100);

      res.json(transactions.map(serializeTransaction));
    } catch (err) {
      next(err);
    }
  },
);

inventoryRouter.get(
  "/inventory/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = GetInventoryItemParams.parse(req.params);

      const [item] = await db
        .select()
        .from(inventoryItemsTable)
        .where(eq(inventoryItemsTable.id, id));

      if (!item) {
        throw new ApiError(404, `Inventory item ${id} not found`);
      }

      res.json(serializeItem(item));
    } catch (err) {
      next(err);
    }
  },
);
