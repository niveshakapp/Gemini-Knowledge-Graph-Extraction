import { useState } from "react";
import { useCreateQueueItem } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { Loader2, Send, Database, Building2 } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { defaultPrompt } from "@shared/constants";

const GEMINI_MODELS = [
  { id: 'gemini-3-flash', name: 'Gemini 3 Fast', description: 'Answers quickly' },
  { id: 'gemini-3-flash-thinking', name: 'Gemini 3 Thinking', description: 'Solves complex problems' },
  { id: 'gemini-3-pro', name: 'Gemini 3 Pro', description: 'Thinks longer for advanced maths and code' }
];

export default function AddTask() {
  const [entityType, setEntityType] = useState<'Stock' | 'Industry'>('Stock');
  const [name, setName] = useState("");
  const [id, setId] = useState(""); // Simplified: User enters ID manually for now since we don't have lookup UI
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [priority, setPriority] = useState(0);
  const [selectedModel, setSelectedModel] = useState('gemini-3-pro'); // Default to Gemini 3 Pro

  const createMutation = useCreateQueueItem();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Quick validation hack for simplified ID entry
    const numericId = parseInt(id);
    if (isNaN(numericId)) {
      toast({ title: "Invalid ID", description: "Entity ID must be a number", variant: "destructive" });
      return;
    }

    try {
      await createMutation.mutateAsync({
        entityType,
        entityId: numericId,
        entityName: name,
        promptText: prompt,
        priority,
        geminiModel: selectedModel
      });
      toast({ title: "Task Queued", description: `Extraction for ${name} has been added to the queue.` });
      setLocation("/");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
      <PageHeader 
        title="Initialize Extraction" 
        description="Add a new entity to the processing queue. High priority tasks will be processed first." 
      />

      <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-8 shadow-lg space-y-8">
        
        {/* Entity Type Selection */}
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setEntityType('Stock')}
            className={cn(
              "flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all duration-200",
              entityType === 'Stock' 
                ? "border-primary bg-primary/5 text-primary" 
                : "border-muted bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/30"
            )}
          >
            <Database className="w-8 h-8" />
            <span className="font-semibold">Stock Entity</span>
          </button>
          
          <button
            type="button"
            onClick={() => setEntityType('Industry')}
            className={cn(
              "flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all duration-200",
              entityType === 'Industry' 
                ? "border-accent bg-accent/5 text-accent" 
                : "border-muted bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/30"
            )}
          >
            <Building2 className="w-8 h-8" />
            <span className="font-semibold">Industry Entity</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {entityType === 'Stock' ? 'Company Name / Symbol' : 'Industry Name'}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder={entityType === 'Stock' ? "e.g. Apple Inc. (AAPL)" : "e.g. Semiconductor Manufacturing"}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Internal Entity ID</label>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="123"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Extraction Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full h-48 bg-background border border-border rounded-lg px-4 py-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            required
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <label className="text-sm font-medium">Processing Priority</label>
            <span className="text-sm text-primary font-bold">{priority}</span>
          </div>
          <input
            type="range"
            min="0"
            max="10"
            step="1"
            value={priority}
            onChange={(e) => setPriority(parseInt(e.target.value))}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Low</span>
            <span>Critical</span>
          </div>
        </div>

        {/* Gemini Model Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Gemini Model</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {GEMINI_MODELS.map((model) => (
              <button
                key={model.id}
                type="button"
                onClick={() => setSelectedModel(model.id)}
                className={cn(
                  "flex flex-col items-start gap-2 p-4 rounded-lg border-2 transition-all duration-200 text-left",
                  selectedModel === model.id
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-muted bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:border-muted-foreground/30"
                )}
              >
                <span className="font-semibold text-sm">{model.name}</span>
                <span className="text-xs opacity-80">{model.description}</span>
                {model.id === 'gemini-1.5-pro-002' && (
                  <span className="text-xs bg-primary/20 px-2 py-0.5 rounded">Default</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-3 rounded-lg font-semibold shadow-lg shadow-primary/20 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            Enqueue Task
          </button>
        </div>
      </form>
    </div>
  );
}
