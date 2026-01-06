import { useStocks, useIndustries, useQueue, useKGs, useQueueControl, useConfig } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { BarChart3, Factory, Layers, Network, Zap, Play, Pause } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { useToast } from "@/hooks/use-toast";
import React from "react";

export default function Overview() {
  const { data: stocks, isLoading: loadingStocks } = useStocks();
  const { data: industries, isLoading: loadingIndustries } = useIndustries();
  const { data: queue, isLoading: loadingQueue } = useQueue();
  const { data: kgs, isLoading: loadingKGs } = useKGs();
  const { data: configs } = useConfig();
  const queueControlMutation = useQueueControl();
  const { toast } = useToast();

  const queueEnabled = configs?.find(c => c.configKey === 'queue_processing_enabled')?.configValue === 'true';

  const handleQueueControl = async (action: 'start' | 'stop') => {
    try {
      await queueControlMutation.mutateAsync(action);
      toast({
        title: action === 'start' ? 'Queue Started' : 'Queue Stopped',
        description: action === 'start' ? 'Processing will begin shortly' : 'Processing has been paused'
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Generate chart data from actual KGs
  const chartData = React.useMemo(() => {
    if (!kgs || kgs.length === 0) {
      return Array.from({ length: 7 }, (_, i) => ({
        name: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i],
        extractions: 0
      }));
    }
    // Group KGs by day of week
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = new Array(7).fill(0);
    kgs.forEach(kg => {
      if (kg.extractedAt) {
        const day = new Date(kg.extractedAt).getDay();
        counts[day]++;
      }
    });
    return days.map((name, i) => ({ name, extractions: counts[i] }));
  }, [kgs]);

  const pendingTasks = queue?.filter(q => q.status === 'queued' || q.status === 'processing').length || 0;
  const processingTasks = queue?.filter(q => q.status === 'processing').length || 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Command Center"
          description="Real-time operational overview of the Knowledge Graph Extraction Engine."
        />
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold border ${queueEnabled && processingTasks > 0 ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-muted text-muted-foreground border-border'}`}>
            {queueEnabled && processingTasks > 0 ? '● PROCESSING' : '○ IDLE'}
          </div>
          <button
            onClick={() => handleQueueControl(queueEnabled ? 'stop' : 'start')}
            disabled={queueControlMutation.isPending}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${queueEnabled ? 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20' : 'bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20'}`}
          >
            {queueEnabled ? <><Pause className="w-4 h-4" /> Stop Queue</> : <><Play className="w-4 h-4" /> Start Queue</>}
          </button>
        </div>
      </div>

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
