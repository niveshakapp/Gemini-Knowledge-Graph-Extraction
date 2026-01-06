import { useQueue } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { format } from "date-fns";
import { Clock, CheckCircle, AlertCircle, Loader2, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function QueuePage() {
  const { data: queue, isLoading } = useQueue();
  const { toast } = useToast();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPriority, setEditPriority] = useState<number>(0);

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'processing':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20"><Loader2 className="w-3 h-3 animate-spin" /> Processing</span>;
      case 'completed':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500 border border-green-500/20"><CheckCircle className="w-3 h-3" /> Completed</span>;
      case 'failed':
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-500 border border-red-500/20"><AlertCircle className="w-3 h-3" /> Failed</span>;
      default:
        return <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-500 border border-yellow-500/20"><Clock className="w-3 h-3" /> Queued</span>;
    }
  };

  const handleEditPriority = async (id: number, currentPriority: number) => {
    setEditingId(id);
    setEditPriority(currentPriority);
  };

  const handleSavePriority = async (id: number) => {
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: editPriority })
      });
      if (!res.ok) throw new Error('Failed to update priority');
      toast({ title: "Priority Updated", description: "Task priority has been updated" });
      setEditingId(null);
      // Refresh queue data
      window.location.reload();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to remove this task from the queue?")) {
      try {
        const res = await fetch(`/api/queue/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete task');
        toast({ title: "Task Removed", description: "Task has been removed from queue" });
        // Refresh queue data
        window.location.reload();
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Extraction Queue"
        description="Monitor and manage pending extraction tasks."
      />

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground">Loading queue...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Entity</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Type</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Priority</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Status</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Model</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Created</th>
                  <th className="px-6 py-4 font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {queue?.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{item.entityName}</td>
                    <td className="px-6 py-4">
                      <span className={cn("px-2 py-1 rounded text-xs font-medium", item.entityType === 'Stock' ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500')}>
                        {item.entityType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {editingId === item.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={editPriority}
                            onChange={(e) => setEditPriority(parseInt(e.target.value))}
                            className="w-16 px-2 py-1 bg-background border border-border rounded text-sm"
                          />
                          <button
                            onClick={() => handleSavePriority(item.id)}
                            className="text-green-500 hover:text-green-600"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-red-500 hover:text-red-600"
                          >
                            <AlertCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono font-bold text-primary">{item.priority}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                    <td className="px-6 py-4 font-mono text-xs text-muted-foreground">{item.geminiModel}</td>
                    <td className="px-6 py-4 text-muted-foreground font-mono text-xs">
                      {item.createdAt ? format(new Date(item.createdAt), "MMM d, HH:mm") : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {item.status === 'queued' && (
                          <button
                            onClick={() => handleEditPriority(item.id, item.priority || 0)}
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="Edit priority"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {(item.status === 'queued' || item.status === 'failed') && (
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove from queue"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {queue?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                      No tasks in queue. Add a task to get started.
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
