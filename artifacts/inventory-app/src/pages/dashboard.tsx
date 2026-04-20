import { useGetInventoryStats, useGetLowStockItems, useListTransactions } from "@workspace/api-client-react";
import { Package, DollarSign, AlertCircle, Tags, ArrowDownRight, ArrowUpRight, Activity } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetInventoryStats();
  const { data: lowStockItems, isLoading: lowStockLoading } = useGetLowStockItems();
  const { data: transactions, isLoading: transactionsLoading } = useListTransactions();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1">System-wide inventory metrics and recent activity.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
        ) : (
          <>
            <StatCard
              title="Total Items"
              value={stats?.totalItems ?? 0}
              icon={<Package />}
              description="Unique SKUs in system"
            />
            <StatCard
              title="Total Value"
              value={formatCurrency(stats?.totalValue ?? 0)}
              icon={<DollarSign />}
              description="Estimated inventory value"
            />
            <StatCard
              title="Low Stock Alerts"
              value={stats?.lowStockCount ?? 0}
              icon={<AlertCircle />}
              valueClassName={(stats?.lowStockCount ?? 0) > 0 ? "text-destructive" : "text-emerald-500"}
            />
            <StatCard
              title="Categories"
              value={stats?.categories ?? 0}
              icon={<Tags />}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="lg:col-span-4 border-border/40 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Transactions</CardTitle>
                <CardDescription>Latest inventory movements and updates</CardDescription>
              </div>
              <Activity className="h-5 w-5 text-muted-foreground opacity-50" />
            </div>
          </CardHeader>
          <CardContent>
            {transactionsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : transactions?.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md">
                No recent transactions.
              </div>
            ) : (
              <div className="space-y-4">
                {transactions?.slice(0, 8).map((tx, i) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20 animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `\${i * 50}ms`, animationFillMode: 'both' }}>
                    <div className="flex items-center space-x-4">
                      <div className={`p-2 rounded-full \${
                        tx.type === 'added' ? 'bg-emerald-500/10 text-emerald-500' :
                        tx.type === 'consumed' ? 'bg-amber-500/10 text-amber-500' :
                        'bg-blue-500/10 text-blue-500'
                      }`}>
                        {tx.type === 'added' ? <ArrowUpRight className="h-4 w-4" /> :
                         tx.type === 'consumed' ? <ArrowDownRight className="h-4 w-4" /> :
                         <Package className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-medium font-mono">{tx.itemName}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(tx.createdAt), "MMM d, h:mm a")}
                          {tx.notes && <span className="ml-1 opacity-70">- {tx.notes}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold font-mono \${
                        tx.type === 'added' ? 'text-emerald-500' :
                        tx.type === 'consumed' ? 'text-amber-500' :
                        'text-foreground'
                      }`}>
                        {tx.type === 'added' ? '+' : tx.type === 'consumed' ? '-' : ''}{Math.abs(tx.quantityChange)}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {tx.previousQuantity} → {tx.newQuantity}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 border-border/40 shadow-sm flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-destructive">Low Stock Alerts</CardTitle>
                <CardDescription>Items below minimum threshold</CardDescription>
              </div>
              <AlertCircle className="h-5 w-5 text-destructive opacity-50" />
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            {lowStockLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : lowStockItems?.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-sm text-muted-foreground border border-dashed rounded-md p-6 text-center">
                <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-3">
                  <Package className="h-5 w-5 text-emerald-500" />
                </div>
                All inventory levels are healthy.
              </div>
            ) : (
              <div className="space-y-4 flex-1">
                {lowStockItems?.slice(0, 6).map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between pb-3 border-b border-border/40 last:border-0 last:pb-0 animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `\${(i + 4) * 50}ms`, animationFillMode: 'both' }}>
                    <div>
                      <p className="text-sm font-medium font-mono">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.sku || 'No SKU'} • {item.category || 'Uncategorized'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-destructive font-mono">{item.quantity} {item.unit}</p>
                      <p className="text-xs text-muted-foreground">Min: {item.minQuantity ?? 5}</p>
                    </div>
                  </div>
                ))}
                {(lowStockItems?.length ?? 0) > 6 && (
                  <Button variant="outline" className="w-full mt-4" asChild>
                    <Link href="/inventory?lowStock=true">View All Alerts</Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}