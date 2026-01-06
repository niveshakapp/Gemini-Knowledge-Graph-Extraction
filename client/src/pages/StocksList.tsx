import { useStocks } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { format } from "date-fns";
import { BadgeCheck, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function StocksList() {
  const { data: stocks, isLoading } = useStocks();

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'completed': 
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20"><BadgeCheck className="w-3 h-3" /> Completed</span>;
      case 'failed':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20"><AlertCircle className="w-3 h-3" /> Failed</span>;
      default:
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"><Clock className="w-3 h-3" /> Pending</span>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Stock Entities" 
        description="Manage the list of companies targeted for knowledge graph extraction." 
      />

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading entities...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Symbol</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Company Name</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Industry</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Status</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Added On</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {stocks?.map((stock) => (
                  <tr key={stock.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-mono font-bold text-primary">{stock.symbol}</td>
                    <td className="px-6 py-4 font-medium">{stock.companyName}</td>
                    <td className="px-6 py-4 text-muted-foreground">{stock.industry || '-'}</td>
                    <td className="px-6 py-4">{getStatusBadge(stock.status)}</td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                      {stock.createdAt ? format(new Date(stock.createdAt), "MMM d, yyyy") : '-'}
                    </td>
                  </tr>
                ))}
                {stocks?.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                      No stocks found. Add a task to populate this list.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
