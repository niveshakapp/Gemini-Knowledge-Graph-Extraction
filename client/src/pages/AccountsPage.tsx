import { useState } from "react";
import { useAccounts, useCreateAccount, useDeleteAccount } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { format } from "date-fns";
import { Shield, Plus, Trash2, CheckCircle, XCircle, Power } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"; // Assuming basic dialog exists or using manual overlay
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

export default function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts();
  const deleteMutation = useDeleteAccount();
  const createMutation = useCreateAccount();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ accountName: "", email: "", passwordEncrypted: "" });

  const activateAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/accounts/activate-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to activate accounts');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] });
      toast({
        title: "Accounts Activated",
        description: `Successfully activated ${data.count} Gemini accounts`
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync(newAccount);
      toast({ title: "Account Added", description: "New Gemini account is ready for rotation." });
      setIsDialogOpen(false);
      setNewAccount({ accountName: "", email: "", passwordEncrypted: "" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to remove this account?")) {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Account Removed", variant: "default" });
    }
  };

  const handleToggleActive = async (id: number) => {
    try {
      const res = await fetch(`/api/accounts/${id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to toggle account');
      queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] });
      toast({ title: "Account Updated", description: "Account status has been changed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Gemini Accounts"
        description="Manage the pool of accounts used for API rotation and extraction."
        action={
          <div className="flex gap-3">
            <button
              onClick={() => activateAllMutation.mutate()}
              disabled={activateAllMutation.isPending}
              className="bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/20 px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all"
              title="Activate all accounts (fixes detection issues)"
            >
              <Power className="w-4 h-4" />
              {activateAllMutation.isPending ? 'Activating...' : 'Activate All'}
            </button>
            <button
              onClick={() => setIsDialogOpen(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-lg shadow-primary/20 flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" /> Add Account
            </button>
          </div>
        }
      />

      {/* Manual Dialog Overlay since we aren't using a complex component library for this demo */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border w-full max-w-md p-6 rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-4">Add Gemini Account</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Account Name (Alias)</label>
                <input 
                  className="w-full bg-background border border-border rounded px-3 py-2"
                  value={newAccount.accountName}
                  onChange={e => setNewAccount({...newAccount, accountName: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Email</label>
                <input 
                  className="w-full bg-background border border-border rounded px-3 py-2"
                  type="email"
                  value={newAccount.email}
                  onChange={e => setNewAccount({...newAccount, email: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Password</label>
                <input 
                  className="w-full bg-background border border-border rounded px-3 py-2"
                  type="password"
                  value={newAccount.passwordEncrypted}
                  onChange={e => setNewAccount({...newAccount, passwordEncrypted: e.target.value})}
                  required
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 text-muted-foreground hover:text-foreground">Cancel</button>
                <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded font-medium">Add Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? <div className="col-span-full text-center py-10">Loading accounts...</div> : accounts?.map((account) => (
          <div key={account.id} className="bg-card border border-border rounded-xl p-6 shadow-sm hover:border-primary/30 transition-all group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <Shield className="w-20 h-20" />
            </div>
            
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-secondary rounded-lg">
                  <Shield className="w-6 h-6 text-muted-foreground" />
                </div>
                {account.isActive ? (
                  <span className="flex items-center gap-1 text-xs font-bold text-green-500 bg-green-500/10 px-2 py-1 rounded-full border border-green-500/20">
                    <CheckCircle className="w-3 h-3" /> ACTIVE
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded-full border border-red-500/20">
                    <XCircle className="w-3 h-3" /> DISABLED
                  </span>
                )}
              </div>
              
              <h3 className="text-lg font-bold truncate">{account.accountName}</h3>
              <p className="text-sm text-muted-foreground truncate mb-6">{account.email}</p>
              
              <div className="grid grid-cols-3 gap-2 mb-6">
                <div className="text-center p-2 bg-secondary/30 rounded border border-border">
                  <div className="text-xs text-muted-foreground mb-1">Success</div>
                  <div className="font-mono font-bold text-green-500">{account.successCount}</div>
                </div>
                <div className="text-center p-2 bg-secondary/30 rounded border border-border">
                  <div className="text-xs text-muted-foreground mb-1">Failed</div>
                  <div className="font-mono font-bold text-red-500">{account.failureCount}</div>
                </div>
                <div className="text-center p-2 bg-secondary/30 rounded border border-border">
                  <div className="text-xs text-muted-foreground mb-1">Total</div>
                  <div className="font-mono font-bold">{account.totalExtractionsCount}</div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border gap-2">
                <span className="text-xs text-muted-foreground">
                  Last used: {account.lastUsedAt ? format(new Date(account.lastUsedAt), 'MMM d, HH:mm') : 'Never'}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleToggleActive(account.id)}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      account.isActive
                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                        : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                    }`}
                    title={account.isActive ? 'Disable account' : 'Enable account'}
                  >
                    {account.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleDelete(account.id)}
                    className="text-muted-foreground hover:text-destructive transition-colors p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
