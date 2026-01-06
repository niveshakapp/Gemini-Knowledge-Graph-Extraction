import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/Sidebar";
import { useUser } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

// Pages
import Auth from "@/pages/Auth";
import Overview from "@/pages/Overview";
import AddTask from "@/pages/AddTask";
import StocksList from "@/pages/StocksList";
import IndustriesList from "@/pages/StocksList"; // Reusing for now as they are similar tables, normally separate
import AccountsPage from "@/pages/AccountsPage";
import KGsPage from "@/pages/KGsPage";
import LogsPage from "@/pages/LogsPage";
import NotFound from "@/pages/not-found";

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = useUser();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary">
        <Loader2 className="w-10 h-10 animate-spin" />
      </div>
    );
  }

  if (!user) {
    setLocation("/auth");
    return null;
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
        <div className="max-w-7xl mx-auto pb-20">
          {children}
        </div>
      </main>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={Auth} />
      
      <Route path="/">
        <ProtectedLayout><Overview /></ProtectedLayout>
      </Route>
      <Route path="/add-task">
        <ProtectedLayout><AddTask /></ProtectedLayout>
      </Route>
      <Route path="/stocks">
        <ProtectedLayout><StocksList /></ProtectedLayout>
      </Route>
      <Route path="/industries">
        <ProtectedLayout><StocksList /></ProtectedLayout> {/* Reusing table for demo */}
      </Route>
      <Route path="/accounts">
        <ProtectedLayout><AccountsPage /></ProtectedLayout>
      </Route>
      <Route path="/kgs">
        <ProtectedLayout><KGsPage /></ProtectedLayout>
      </Route>
      <Route path="/logs">
        <ProtectedLayout><LogsPage /></ProtectedLayout>
      </Route>
      <Route path="/config">
        <ProtectedLayout>
          <div className="p-8 text-center text-muted-foreground">Configuration module coming in v2.1</div>
        </ProtectedLayout>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
