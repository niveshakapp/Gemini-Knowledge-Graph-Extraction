import { useLogs } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { LogTerminal } from "@/components/LogTerminal";
import { useState, useMemo } from "react";
import { Filter } from "lucide-react";

export default function LogsPage() {
  const { data: logs = [] } = useLogs();
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

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col animate-in fade-in duration-300 gap-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <PageHeader
          title="Live System Logs"
          description="Monitoring stream of all system activities, errors, and extraction events."
        />
        <div className="flex gap-3 items-center">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="bg-transparent text-sm font-medium focus:outline-none"
            >
              <option value="all">All Levels</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="debug">Debug</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Search logs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-card border border-border rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <LogTerminal logs={filteredLogs} height="100%" />
      </div>
    </div>
  );
}
