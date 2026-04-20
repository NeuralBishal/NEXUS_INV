import { Badge } from "@/components/ui/badge";

interface LowStockBadgeProps {
  quantity: number;
  minQuantity?: number | null;
}

export function LowStockBadge({ quantity, minQuantity }: LowStockBadgeProps) {
  const threshold = minQuantity ?? 5;
  const isLowStock = quantity <= threshold;

  if (isLowStock) {
    return (
      <Badge variant="destructive" className="font-mono bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20">
        Low Stock
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="font-mono bg-emerald-500/10 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/20">
      In Stock
    </Badge>
  );
}