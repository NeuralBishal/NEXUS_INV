import { useState, useEffect } from "react";
import { useListInventoryItems, useListCategories, useGetInventoryItem, getGetInventoryItemQueryKey, getListInventoryItemsQueryKey, getGetInventoryStatsQueryKey, getGetLowStockItemsQueryKey, getListTransactionsQueryKey, getListCategoriesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Filter, AlertCircle, X, ExternalLink, Package, Download, Pencil, Save, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { LowStockBadge } from "@/components/low-stock-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const formatCurrency = (value: number | null | undefined) => {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
};

interface EditableFields {
  name: string;
  sku: string;
  category: string;
  quantity: string;
  unit: string;
  minQuantity: string;
  unitPrice: string;
  location: string;
  supplier: string;
  description: string;
}

function InventoryDetailDialog({ id, open, onOpenChange }: { id: number | null, open: boolean, onOpenChange: (o: boolean) => void }) {
  const { data: item, isLoading } = useGetInventoryItem(id!, { query: { enabled: !!id && open } });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditableFields | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset form whenever the dialog opens with a new item
  useEffect(() => {
    if (item && open) {
      setForm({
        name: item.name ?? "",
        sku: item.sku ?? "",
        category: item.category ?? "",
        quantity: String(item.quantity ?? ""),
        unit: item.unit ?? "",
        minQuantity: item.minQuantity != null ? String(item.minQuantity) : "",
        unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
        location: item.location ?? "",
        supplier: item.supplier ?? "",
        description: item.description ?? "",
      });
    }
    if (!open) setEditing(false);
  }, [item, open]);

  const updateField = (key: keyof EditableFields, value: string) => {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const handleSave = async () => {
    if (!form || !id) return;
    if (!form.name.trim()) {
      toast({ title: "Name required", description: "Item name cannot be empty.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        category: form.category.trim() || null,
        quantity: form.quantity === "" ? undefined : Number(form.quantity),
        unit: form.unit.trim() || null,
        minQuantity: form.minQuantity === "" ? null : Number(form.minQuantity),
        unitPrice: form.unitPrice === "" ? null : Number(form.unitPrice),
        location: form.location.trim() || null,
        supplier: form.supplier.trim() || null,
        description: form.description.trim() || null,
      };

      const res = await fetch(`/api/inventory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }
      toast({ title: "Saved", description: "Item updated successfully." });
      // Refresh all relevant queries
      queryClient.invalidateQueries({ queryKey: getGetInventoryItemQueryKey(id) });
      queryClient.invalidateQueries({ queryKey: getListInventoryItemsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetInventoryStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetLowStockItemsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
      setEditing(false);
    } catch (err) {
      toast({ title: "Save failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border-border/40 shadow-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="font-mono text-xl truncate">{item?.name || "Loading..."}</DialogTitle>
              <DialogDescription>{editing ? "Editing item — changes are tracked in transactions" : "Item Details"}</DialogDescription>
            </div>
            {item && !editing && !isLoading && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="shrink-0 mt-1">
                <Pencil className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading || !form ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-1/3" />
          </div>
        ) : item ? (
          editing ? (
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="f-name">Item Name *</Label>
                <Input id="f-name" value={form.name} onChange={(e) => updateField("name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-sku">SKU / Code</Label>
                <Input id="f-sku" value={form.sku} onChange={(e) => updateField("sku", e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-category">Category</Label>
                <Input id="f-category" value={form.category} onChange={(e) => updateField("category", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-qty">Quantity</Label>
                <Input id="f-qty" type="number" step="0.01" min="0" value={form.quantity} onChange={(e) => updateField("quantity", e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-unit">Unit</Label>
                <Input id="f-unit" value={form.unit} onChange={(e) => updateField("unit", e.target.value)} placeholder="NOS, KG, etc." />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-min">Min Threshold</Label>
                <Input id="f-min" type="number" step="0.01" min="0" value={form.minQuantity} onChange={(e) => updateField("minQuantity", e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-price">Unit Price (₹)</Label>
                <Input id="f-price" type="number" step="0.01" min="0" value={form.unitPrice} onChange={(e) => updateField("unitPrice", e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-location">Location</Label>
                <Input id="f-location" value={form.location} onChange={(e) => updateField("location", e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="f-supplier">Supplier</Label>
                <Input id="f-supplier" value={form.supplier} onChange={(e) => updateField("supplier", e.target.value)} />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="f-desc">Description / Notes</Label>
                <Input id="f-desc" value={form.description} onChange={(e) => updateField("description", e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-6 py-4">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU</span>
                <p className="font-mono">{item.sku || "—"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</span>
                <p>{item.category || "—"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
                <div><LowStockBadge quantity={item.quantity} minQuantity={item.minQuantity} /></div>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quantity</span>
                <p className="font-mono text-lg">{item.quantity} <span className="text-sm text-muted-foreground">{item.unit || "units"}</span></p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Min Threshold</span>
                <p className="font-mono">{item.minQuantity ?? 5}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Unit Price</span>
                <p className="font-mono">{formatCurrency(item.unitPrice)}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</span>
                <p>{item.supplier || "—"}</p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</span>
                <p className="font-mono">{item.location || "—"}</p>
              </div>
              <div className="col-span-2 space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</span>
                <p className="text-sm text-muted-foreground">{item.description || "No description provided."}</p>
              </div>
              <div className="col-span-2 flex justify-between text-xs text-muted-foreground border-t border-border/30 pt-4 mt-2">
                <span>Created: {format(new Date(item.createdAt), "MMM d, yyyy")}</span>
                <span>Last Updated: {format(new Date(item.lastUpdated), "MMM d, yyyy h:mm a")}</span>
              </div>
            </div>
          )
        ) : (
          <div className="py-8 text-center text-muted-foreground">Item not found.</div>
        )}

        {editing && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Changes</>}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Inventory() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [lowStock, setLowStock] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: categories } = useListCategories();

  const params = {
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(category !== "all" && { category }),
    ...(lowStock && { lowStock: "true" })
  };

  const { data: items, isLoading } = useListInventoryItems(params);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/inventory/export.xlsx");
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Downloaded", description: "Excel file with current inventory has been saved." });
    } catch (err) {
      toast({ title: "Export failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory Registry</h1>
          <p className="text-muted-foreground mt-1">Manage and track all registered items.</p>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Preparing...</> : <><Download className="h-4 w-4 mr-2" />Export to Excel</>}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-end sm:items-center bg-card p-4 rounded-lg border border-border/40 shadow-sm">
        <div className="relative flex-1 w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search items, SKUs..."
            className="pl-9 font-mono bg-background"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-4 w-full sm:w-auto">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[180px] bg-background">
              <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories?.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center space-x-2 pl-2">
            <Switch id="low-stock" checked={lowStock} onCheckedChange={setLowStock} />
            <Label htmlFor="low-stock" className="flex items-center cursor-pointer text-sm font-medium">
              <AlertCircle className="mr-1.5 h-4 w-4 text-destructive" />
              Low Stock Only
            </Label>
          </div>
        </div>
      </div>

      <div className="border border-border/40 rounded-lg shadow-sm bg-card overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[100px]">SKU</TableHead>
              <TableHead>Item Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Unit Price</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                  <TableCell></TableCell>
                </TableRow>
              ))
            ) : items?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-64 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center">
                    <Package className="h-10 w-10 mb-4 opacity-20" />
                    <p>No items found matching your filters.</p>
                    {(search || category !== "all" || lowStock) && (
                      <Button variant="link" onClick={() => { setSearch(""); setCategory("all"); setLowStock(false); }} className="mt-2">
                        Clear filters
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items?.map((item) => (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-muted/40 transition-colors group"
                  onClick={() => setSelectedItemId(item.id)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">{item.sku || "—"}</TableCell>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    {item.category ? (
                      <Badge variant="secondary" className="font-normal text-xs">{item.category}</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono font-medium">
                    {item.quantity} <span className="text-xs text-muted-foreground font-sans font-normal ml-1">{item.unit || "ea"}</span>
                  </TableCell>
                  <TableCell>
                    <LowStockBadge quantity={item.quantity} minQuantity={item.minQuantity} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {formatCurrency(item.unitPrice)}
                  </TableCell>
                  <TableCell>
                    <ExternalLink className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <InventoryDetailDialog
        id={selectedItemId}
        open={selectedItemId !== null}
        onOpenChange={(open) => !open && setSelectedItemId(null)}
      />
    </div>
  );
}
