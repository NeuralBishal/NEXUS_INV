import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryItemsTable = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category"),
  sku: text("sku"),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("0"),
  unit: text("unit"),
  minQuantity: numeric("min_quantity", { precision: 12, scale: 3 }),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  supplier: text("supplier"),
  location: text("location"),
  description: text("description"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryItemSchema = createInsertSchema(inventoryItemsTable).omit({
  id: true,
  createdAt: true,
  lastUpdated: true,
});
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItemsTable.$inferSelect;

export const transactionsTable = pgTable("inventory_transactions", {
  id: serial("id").primaryKey(),
  itemId: integer("item_id").notNull(),
  itemName: text("item_name").notNull(),
  type: text("type").notNull(), // 'added' | 'consumed' | 'updated'
  quantityChange: numeric("quantity_change", { precision: 12, scale: 3 }).notNull(),
  previousQuantity: numeric("previous_quantity", { precision: 12, scale: 3 }).notNull(),
  newQuantity: numeric("new_quantity", { precision: 12, scale: 3 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Transaction = typeof transactionsTable.$inferSelect;

export const syncLogsTable = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  fileName: text("file_name"),
  itemsProcessed: integer("items_processed").notNull().default(0),
  itemsAdded: integer("items_added").notNull().default(0),
  itemsUpdated: integer("items_updated").notNull().default(0),
  itemsRemoved: integer("items_removed").notNull().default(0),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SyncLog = typeof syncLogsTable.$inferSelect;
