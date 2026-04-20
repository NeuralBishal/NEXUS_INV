import { Link, useLocation } from "wouter";
import { LayoutDashboard, PackageSearch, Upload, Package } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <SidebarProvider>
      <div className="flex min-h-[100dvh] w-full bg-background text-foreground">
        <Sidebar variant="inset" className="border-r border-border/50">
          <SidebarContent className="bg-sidebar">
            <div className="flex h-16 items-center px-4 font-mono font-bold tracking-tight text-primary-foreground border-b border-border/10">
              <Package className="mr-2 h-5 w-5 text-accent" />
              NEXUS_INV
            </div>
            <SidebarGroup>
              <SidebarGroupLabel className="text-muted-foreground font-mono text-xs uppercase tracking-wider">Operations</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/"}>
                      <Link href="/">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/inventory"}>
                      <Link href="/inventory">
                        <PackageSearch className="mr-2 h-4 w-4" />
                        <span>Inventory</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location === "/upload"}>
                      <Link href="/upload">
                        <Upload className="mr-2 h-4 w-4" />
                        <span>Sync Excel</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1 flex flex-col min-h-[100dvh] overflow-hidden">
          <div className="flex-1 overflow-y-auto bg-background p-6 lg:p-8">
            <div className="mx-auto max-w-7xl">
              {children}
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}