import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  LayoutDashboard, 
  PlusCircle, 
  BarChart3, 
  Factory, 
  Key, 
  Settings, 
  Network, 
  TerminalSquare,
  LogOut
} from "lucide-react";
import { useLogout } from "@/hooks/use-auth";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", href: "/" },
  { icon: PlusCircle, label: "Add Task", href: "/add-task" },
  { icon: BarChart3, label: "Stocks", href: "/stocks" },
  { icon: Factory, label: "Industries", href: "/industries" },
  { icon: Key, label: "Gemini Accounts", href: "/accounts" },
  { icon: Network, label: "Extracted KGs", href: "/kgs" },
  { icon: Settings, label: "Configuration", href: "/config" },
  { icon: TerminalSquare, label: "Live Logs", href: "/logs" },
];

export function Sidebar() {
  const [location] = useLocation();
  const logoutMutation = useLogout();

  return (
    <div className="h-screen w-64 bg-card border-r border-border flex flex-col fixed left-0 top-0 z-50 shadow-2xl">
      <div className="p-6 border-b border-border">
        <h1 className="text-xl font-display font-bold text-primary tracking-tighter flex items-center gap-2">
          <Network className="w-6 h-6" />
          KG Extractor v2
        </h1>
        <p className="text-xs text-muted-foreground mt-1 font-mono">System Status: ONLINE</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {menuItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group font-medium text-sm",
                isActive 
                  ? "bg-primary/10 text-primary shadow-[0_0_15px_-3px_rgba(34,197,94,0.3)] border border-primary/20" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className={cn("w-4 h-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border bg-card/50">
        <button 
          onClick={() => logoutMutation.mutate()}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Disconnect Session
        </button>
      </div>
    </div>
  );
}
