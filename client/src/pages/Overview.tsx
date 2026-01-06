import { useStocks, useIndustries, useQueue, useKGs } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { BarChart3, Factory, Layers, Network, Zap } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export default function Overview() {
  const { data: stocks, isLoading: loadingStocks } = useStocks();
  const { data: industries, isLoading: loadingIndustries } = useIndustries();
  const { data: queue, isLoading: loadingQueue } = useQueue();
  const { data: kgs, isLoading: loadingKGs } = useKGs();

  // Mock data for the chart since we don't have historical data points in this simplified schema
  const chartData = [
    { name: 'Mon', extractions: 4 },
    { name: 'Tue', extractions: 7 },
    { name: 'Wed', extractions: 5 },
    { name: 'Thu', extractions: 12 },
    { name: 'Fri', extractions: 9 },
    { name: 'Sat', extractions: 15 },
    { name: 'Sun', extractions: 11 },
  ];

  const pendingTasks = queue?.filter(q => q.status === 'queued' || q.status === 'processing').length || 0;
  const processingTasks = queue?.filter(q => q.status === 'processing').length || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader 
        title="Command Center" 
        description="Real-time operational overview of the Knowledge Graph Extraction Engine." 
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Stocks" 
          value={stocks?.length || 0} 
          icon={BarChart3} 
          trend="+12%" 
          trendUp={true}
          loading={loadingStocks}
        />
        <StatCard 
          title="Industries" 
          value={industries?.length || 0} 
          icon={Factory} 
          loading={loadingIndustries}
        />
        <StatCard 
          title="Active Queue" 
          value={pendingTasks} 
          icon={Layers} 
          trend={processingTasks > 0 ? `${processingTasks} Processing` : "Idle"}
          trendUp={processingTasks === 0}
          className={processingTasks > 0 ? "border-primary/50 shadow-[0_0_20px_-5px_rgba(34,197,94,0.2)]" : ""}
          loading={loadingQueue}
        />
        <StatCard 
          title="Extracted KGs" 
          value={kgs?.length || 0} 
          icon={Network} 
          className="border-accent/30"
          loading={loadingKGs}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              Extraction Velocity
            </h3>
            <select className="bg-muted text-xs rounded px-2 py-1 border border-border">
              <option>Last 7 Days</option>
              <option>Last 30 Days</option>
            </select>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorExtractions" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="extractions" 
                  stroke="#22c55e" 
                  fillOpacity={1} 
                  fill="url(#colorExtractions)" 
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold mb-4">System Health</h3>
          <div className="space-y-6 flex-1">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">API Rate Limits</span>
                <span className="text-primary font-mono">Good</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-[25%] bg-primary rounded-full" />
              </div>
            </div>
            
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Queue Capacity</span>
                <span className="text-yellow-500 font-mono">Moderate</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-[60%] bg-yellow-500 rounded-full" />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Error Rate</span>
                <span className="text-primary font-mono">0.2%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full w-[1%] bg-red-500 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
