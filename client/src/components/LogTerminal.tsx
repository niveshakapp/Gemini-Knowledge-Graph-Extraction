import { useEffect, useRef } from "react";
import { format } from "date-fns";
import { ActivityLog } from "@shared/schema";
import { cn } from "@/lib/utils";

interface LogTerminalProps {
  logs: ActivityLog[];
  height?: string;
}

export function LogTerminal({ logs, height = "400px" }: LogTerminalProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const getLogColor = (level: string | null) => {
    switch (level?.toLowerCase()) {
      case 'error': return 'text-red-500';
      case 'warning': return 'text-yellow-500';
      case 'success': return 'text-green-500';
      case 'info': return 'text-blue-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="bg-black border border-white/10 rounded-lg shadow-2xl overflow-hidden font-mono text-xs md:text-sm flex flex-col h-full">
      <div className="bg-white/5 px-4 py-2 border-b border-white/5 flex items-center justify-between">
        <span className="text-muted-foreground">system_activity.log</span>
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>
      </div>
      
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide" 
        style={{ height }}
      >
        {logs.length === 0 ? (
          <div className="text-muted-foreground italic opacity-50">Waiting for system activity...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 hover:bg-white/5 p-0.5 rounded transition-colors">
              <span className="text-muted-foreground/50 shrink-0 select-none">
                {log.createdAt ? format(new Date(log.createdAt), 'HH:mm:ss.SSS') : '--:--:--'}
              </span>
              <span className={cn("font-bold uppercase w-16 shrink-0", getLogColor(log.logLevel))}>
                [{log.logLevel || 'INFO'}]
              </span>
              <span className="text-gray-300 break-all">{log.logMessage}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
        <div className="flex items-center gap-2 text-primary mt-2">
          <span className="animate-cursor">_</span>
        </div>
      </div>
    </div>
  );
}
