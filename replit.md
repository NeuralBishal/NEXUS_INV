# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Inventory Management App with Excel file sync support.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite (artifacts/inventory-app)
- **File upload**: multer + xlsx (for Excel parsing)

## Artifacts

### inventory-app (react-vite, preview at /)
Full inventory management web app with:
- Dashboard: stats cards, recent transactions, low stock alerts
- Inventory: searchable/filterable table with item details modal
- Sync Excel: drag-and-drop Excel upload that syncs inventory

### api-server (Express 5, /api)
Routes:
- GET /api/inventory - list items (category/search/lowStock filters)
- GET /api/inventory/stats - summary stats
- GET /api/inventory/categories - unique categories
- GET /api/inventory/low-stock - low stock items
- GET /api/inventory/transactions - recent activity
- GET /api/inventory/:id - single item
- POST /api/upload/excel - upload .xlsx/.xls file, sync inventory
- GET /api/upload/last-sync - last sync info

## Database Tables

- `inventory_items` - all inventory items with quantity, unit, sku, category, price, supplier, location
- `inventory_transactions` - history of quantity changes (added/consumed/updated)
- `sync_logs` - Excel upload history

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Excel File Format

The app accepts .xlsx/.xls files with any of these column names (case-insensitive):
- name / Name / item / material / product (required)
- category / Category / type / group
- sku / SKU / code / id
- quantity / Quantity / qty / stock
- unit / Unit / uom
- min_quantity / minQuantity / Min Quantity / minimum / reorder
- unit_price / unitPrice / Unit Price / price / cost
- supplier / Supplier / vendor
- location / Location / warehouse / bin
- description / Description / notes / remarks

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
