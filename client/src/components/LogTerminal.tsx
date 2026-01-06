import { useEffect, useRef, useState, useMemo } from "react";
import { format } from "date-fns";
import { ActivityLog } from "@shared/schema";
import { cn } from "@/lib/utils";
import { Filter, Search } from "lucide-react";

interface LogTerminalProps {
  logs: ActivityLog[];
  height?: string;
}

export function LogTerminal({ logs, height = "400px" }: LogTerminalProps) {
  const endRef = useRef<HTMLDivElement>(null);
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesLevel = levelFilter === 'all' || log.logLevel === levelFilter;
      const matchesSearch = !searchTerm ||
        log.logMessage?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.entityType?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesLevel && matchesSearch;
    });
  }, [logs, levelFilter, searchTerm]);

  // Reverse logs to show newest first
  const sortedLogs = [...filteredLogs].reverse();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filteredLogs]);

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

      {/* Filters inside terminal */}
      <div className="bg-white/5 px-4 py-2 border-b border-white/10 flex gap-3 items-center">
        <div className="flex items-center gap-2">
          <Filter className="w-3 h-3 text-muted-foreground" />
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-black/50 text-xs text-gray-300 rounded px-2 py-1 border border-white/10 focus:outline-none focus:border-primary/50"
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="success">Success</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
        </div>
        <div className="flex items-center gap-2 flex-1">
          <Search className="w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-black/50 text-xs text-gray-300 rounded px-2 py-1 border border-white/10 w-full focus:outline-none focus:border-primary/50 placeholder:text-gray-600"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {sortedLogs.length} / {logs.length}
        </div>
      </div>
      
      <div 
        className="flex-1 overflow-y-auto p-4 space-y-1 scrollbar-hide" 
        style={{ height }}
      >
        {sortedLogs.length === 0 ? (
          <div className="text-muted-foreground italic opacity-50">Waiting for system activity...</div>
        ) : (
          sortedLogs.map((log) => (
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
