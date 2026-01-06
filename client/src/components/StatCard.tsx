import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  className?: string;
  loading?: boolean;
}

export function StatCard({ title, value, icon: Icon, trend, trendUp, className, loading }: StatCardProps) {
  return (
    <div className={cn(
      "bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group",
      className
    )}>
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
        <Icon className="w-16 h-16" />
      </div>
      
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
        </div>
        
        {loading ? (
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        ) : (
          <div className="flex items-baseline gap-2">
            <h3 className="text-3xl font-display font-bold text-foreground">{value}</h3>
            {trend && (
              <span className={cn(
                "text-xs font-medium px-1.5 py-0.5 rounded",
                trendUp ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10"
              )}>
                {trend}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
