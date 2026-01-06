import { useKGs } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { Network, Copy, ExternalLink, Bot } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function KGsPage() {
  const { data: kgs, isLoading } = useKGs();
  const { toast } = useToast();

  const handleCopy = (json: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(json, null, 2));
    toast({ title: "Copied", description: "JSON copied to clipboard" });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Knowledge Graphs" 
        description="Explore the structured data extracted from your entities." 
      />

      <div className="grid grid-cols-1 gap-6">
        {isLoading ? (
          <div className="text-center py-20 text-muted-foreground">Loading extraction results...</div>
        ) : kgs?.map((kg) => (
          <div key={kg.id} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="p-6 border-b border-border flex items-center justify-between bg-muted/20">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-accent/10 rounded-lg text-accent border border-accent/20">
                  <Network className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold font-display">{kg.entityName}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> {kg.geminiModelUsed || 'Unknown Model'}</span>
                    <span>•</span>
                    <span>{kg.extractedAt ? format(new Date(kg.extractedAt), 'MMM d, yyyy HH:mm') : ''}</span>
                    {kg.extractionConfidence && (
                      <>
                        <span>•</span>
                        <span className="text-green-500 font-medium">{(kg.extractionConfidence * 100).toFixed(0)}% Confidence</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => handleCopy(kg.kgJson)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-background border border-border rounded hover:bg-muted transition-colors"
                >
                  <Copy className="w-3 h-3" /> Copy JSON
                </button>
              </div>
            </div>
            <div className="p-0 bg-[#0d1117]">
              <div className="max-h-96 overflow-y-auto p-4 font-mono text-xs text-blue-300">
                <pre>{JSON.stringify(kg.kgJson, null, 2)}</pre>
              </div>
            </div>
          </div>
        ))}
        {kgs?.length === 0 && !isLoading && (
          <div className="text-center py-20 bg-card border border-border rounded-xl">
            <Network className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-foreground">No Knowledge Graphs Yet</h3>
            <p className="text-muted-foreground max-w-sm mx-auto mt-2">
              Start an extraction task to see results appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
