import * as XLSX from "xlsx";
import type { InsertInventoryItem } from "@workspace/db";

type ExcelRow = Record<string, unknown>;

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function findColumn(row: ExcelRow, ...candidates: string[]): unknown {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeKey(k), v]),
  );
  for (const candidate of candidates) {
    const val = normalized[normalizeKey(candidate)];
    if (val !== undefined && val !== null && val !== "") return val;
  }
  return undefined;
}

function toStringOrNull(val: unknown): string | null {
  if (val === undefined || val === null || val === "") return null;
  return String(val).trim();
}

function toNumericOrNull(val: unknown): string | null {
  if (val === undefined || val === null || val === "") return null;
  const n = Number(val);
  if (isNaN(n)) return null;
  return String(n);
}

export type ParsedExcelItem = InsertInventoryItem;

export interface ParseExcelResult {
  items: ParsedExcelItem[];
  errors: string[];
}

export function parseExcelBuffer(buffer: Buffer): ParseExcelResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    return { items: [], errors: ["Excel file contains no sheets"] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: null });

  const items: ParsedExcelItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const name = toStringOrNull(findColumn(row, "name", "item", "itemname"));
    if (!name) {
      errors.push(`Row ${rowNum}: missing required field "name", skipping`);
      continue;
    }

    const rawQuantity = findColumn(row, "quantity", "qty", "amount", "stock");
    const quantity = toNumericOrNull(rawQuantity);
    if (quantity === null) {
      errors.push(
        `Row ${rowNum} ("${name}"): invalid or missing quantity, defaulting to 0`,
      );
    }

    items.push({
      name,
      category: toStringOrNull(findColumn(row, "category", "type", "group")),
      sku: toStringOrNull(findColumn(row, "sku", "code", "partno", "partnumber")),
      quantity: quantity ?? "0",
      unit: toStringOrNull(findColumn(row, "unit", "uom", "unitofmeasure")),
      minQuantity: toNumericOrNull(
        findColumn(row, "minquantity", "minqty", "minimumquantity", "reorderpoint", "reorder"),
      ),
      unitPrice: toNumericOrNull(
        findColumn(row, "unitprice", "price", "cost", "unitcost"),
      ),
      supplier: toStringOrNull(
        findColumn(row, "supplier", "vendor", "manufacturer"),
      ),
      location: toStringOrNull(
        findColumn(row, "location", "bin", "warehouse", "shelf"),
      ),
      description: toStringOrNull(
        findColumn(row, "description", "notes", "remarks"),
      ),
    });
  }

  return { items, errors };
}
