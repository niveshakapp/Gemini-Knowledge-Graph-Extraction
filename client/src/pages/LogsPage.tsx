import { useLogs } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { LogTerminal } from "@/components/LogTerminal";

export default function LogsPage() {
  const { data: logs = [] } = useLogs();

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col animate-in fade-in duration-300">
      <PageHeader 
        title="Live System Logs" 
        description="Monitoring stream of all system activities, errors, and extraction events." 
      />
      <div className="flex-1 min-h-0">
        <LogTerminal logs={logs} height="100%" />
      </div>
    </div>
  );
}
