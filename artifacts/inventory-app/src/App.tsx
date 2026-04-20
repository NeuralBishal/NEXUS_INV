import { useState } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import UploadExcel from "@/pages/upload";
import Login from "@/pages/login";

const queryClient = new QueryClient();

function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => localStorage.getItem("inv_auth") === "1"
  );

  const login = () => setIsAuthenticated(true);
  const logout = () => {
    localStorage.removeItem("inv_auth");
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
}

function Router({ onLogout }: { onLogout: () => void }) {
  return (
    <AppLayout onLogout={onLogout}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/inventory" component={Inventory} />
        <Route path="/upload" component={UploadExcel} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  const { isAuthenticated, login, logout } = useAuth();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          {isAuthenticated ? (
            <Router onLogout={logout} />
          ) : (
            <Login onLogin={login} />
          )}
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
