import { useState } from "react";
import { useAccounts, useCreateAccount, useDeleteAccount } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { format } from "date-fns";
import { Shield, Plus, Trash2, CheckCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"; // Assuming basic dialog exists or using manual overlay
import { useToast } from "@/hooks/use-toast";

export default function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts();
  const deleteMutation = useDeleteAccount();
  const createMutation = useCreateAccount();
  const { toast } = useToast();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newAccount, setNewAccount] = useState({ accountName: "", email: "", passwordEncrypted: "" });

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <PageHeader 
        title="Gemini Accounts" 
        description="Manage the pool of accounts used for API rotation and extraction." 
        action={
          <button 
            onClick={() => setIsDialogOpen(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-lg shadow-primary/20 flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Account
          </button>
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

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Last used: {account.lastUsedAt ? format(new Date(account.lastUsedAt), 'MMM d, HH:mm') : 'Never'}
                </span>
                <button 
                  onClick={() => handleDelete(account.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
