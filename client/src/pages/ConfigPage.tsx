import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useConfig } from "@/hooks/use-dashboard-data";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { 
  Settings2, 
  ShieldCheck, 
  Monitor, 
  Save,
  Loader2
} from "lucide-react";
import { useState, useEffect } from "react";

export default function ConfigPage() {
  const { toast } = useToast();
  const { data: configs, isLoading } = useConfig();

  const updateConfigMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string, value: string }) => {
      const res = await fetch(api.config.update.path, {
        method: api.config.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error("Failed to update config");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.config.list.path] });
      toast({
        title: "Success",
        description: "Configuration updated successfully",
      });
    },
  });

  const [formState, setFormState] = useState<Record<string, string>>({});

  useEffect(() => {
    if (configs) {
      const state: Record<string, string> = {};
      configs.forEach(c => {
        state[c.configKey] = c.configValue || "";
      });
      setFormState(state);
    }
  }, [configs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const handleSave = (key: string) => {
    updateConfigMutation.mutate({ key, value: formState[key] });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Configuration</h1>
        <p className="text-muted-foreground mt-2">Manage system targets and automation behavior.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* System Targets */}
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Settings2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle>System Targets</CardTitle>
              <CardDescription>Core extraction goals</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Total Stocks Target</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  value={formState['total_stocks_target'] || '0'} 
                  onChange={(e) => setFormState(prev => ({ ...prev, 'total_stocks_target': e.target.value }))}
                />
                <Button size="icon" onClick={() => handleSave('total_stocks_target')}>
                  <Save className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Total Industries Target</Label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  value={formState['total_industries_target'] || '0'} 
                  onChange={(e) => setFormState(prev => ({ ...prev, 'total_industries_target': e.target.value }))}
                />
                <Button size="icon" onClick={() => handleSave('total_industries_target')}>
                  <Save className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Automation Controls */}
        <Card className="hover-elevate">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2 bg-accent/10 rounded-lg">
              <Monitor className="w-5 h-5 text-accent" />
            </div>
            <div>
              <CardTitle>Automation</CardTitle>
              <CardDescription>Queue and rotation strategy</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Queue Processing</Label>
                <p className="text-xs text-muted-foreground">Enable background extraction</p>
              </div>
              <Switch 
                checked={formState['queue_processing_enabled'] === 'true'} 
                onCheckedChange={(checked) => {
                  const val = checked ? 'true' : 'false';
                  setFormState(prev => ({ ...prev, 'queue_processing_enabled': val }));
                  updateConfigMutation.mutate({ key: 'queue_processing_enabled', value: val });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Rotation Strategy</Label>
              <select 
                className="w-full bg-secondary border border-border rounded-md px-3 py-2 text-sm"
                value={formState['account_rotation_strategy'] || 'random'}
                onChange={(e) => {
                  setFormState(prev => ({ ...prev, 'account_rotation_strategy': e.target.value }));
                  updateConfigMutation.mutate({ key: 'account_rotation_strategy', value: e.target.value });
                }}
              >
                <option value="random">Random</option>
                <option value="sequential">Sequential</option>
                <option value="least_used">Least Used</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Stealth Behavior (Visual/Stored) */}
        <Card className="md:col-span-2 hover-elevate">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2 bg-yellow-500/10 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <CardTitle>Stealth Behavior</CardTitle>
              <CardDescription>Anti-detection parameters for Playwright</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-4">
                <Label>Typing Speed (ms per char): 50 - 150</Label>
                <Slider defaultValue={[50, 150]} max={500} step={10} className="w-full" />
              </div>
              <div className="space-y-4">
                <Label>Request Delay (seconds): 30 - 90</Label>
                <Slider defaultValue={[30, 90]} max={300} step={1} className="w-full" />
              </div>
            </div>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Random Pauses</Label>
                  <p className="text-xs text-muted-foreground">Inject human-like behavior</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="space-y-4">
                <Label>Pause Probability: 0.3</Label>
                <Slider defaultValue={[30]} max={100} step={1} className="w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
