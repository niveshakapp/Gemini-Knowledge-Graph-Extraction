import { useState } from "react";
import { useAccounts, useCreateAccount, useDeleteAccount } from "@/hooks/use-dashboard-data";
import { PageHeader } from "@/components/PageHeader";
import { format } from "date-fns";
import { Shield, Plus, Trash2, CheckCircle, XCircle, Power, LogIn, Key } from "lucide-react";
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

  const [sessionDialogOpen, setSessionDialogOpen] = useState(false);
  const [selectedAccountForSession, setSelectedAccountForSession] = useState<any>(null);
  const [sessionJsonInput, setSessionJsonInput] = useState("");

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

  const saveSessionMutation = useMutation({
    mutationFn: async ({ accountId, sessionData }: { accountId: number; sessionData: string }) => {
      const res = await fetch(`/api/accounts/${accountId}/save-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionData })
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to save session');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] });
      toast({
        title: "Session Saved",
        description: "Login session saved successfully! This account can now be used for extractions."
      });
      setSessionDialogOpen(false);
      setSessionJsonInput("");
      setSelectedAccountForSession(null);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const syncSessionMutation = useMutation({
    mutationFn: async (accountId: number) => {
      const res = await fetch(`/api/accounts/${accountId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.details || error.message || 'Sync failed');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] });
      toast({
        title: "Session Synced!",
        description: "Login session captured and saved successfully. Account is ready for use."
      });
    },
    onError: (err: any) => {
      toast({
        title: "Sync Failed",
        description: err.message || "Could not sync session. Try again or use manual paste.",
        variant: "destructive"
      });
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

  const handleOpenSessionDialog = (account: any) => {
    setSelectedAccountForSession(account);
    setSessionDialogOpen(true);
    setSessionJsonInput("");
  };

  const handleSaveSession = () => {
    if (!selectedAccountForSession) return;
    if (!sessionJsonInput.trim()) {
      toast({ title: "Error", description: "Please paste the session JSON", variant: "destructive" });
      return;
    }

    saveSessionMutation.mutate({
      accountId: selectedAccountForSession.id,
      sessionData: sessionJsonInput
    });
  };

  const handleSyncSession = async (account: any) => {
    if (confirm(`This will open a browser window for manual login.\n\nAccount: ${account.accountName} (${account.email})\n\nMake sure you're running this locally. Continue?`)) {
      toast({
        title: "Launching Browser...",
        description: "Please log in manually in the popup window. You have 5 minutes."
      });
      syncSessionMutation.mutate(account.id);
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
                <p className="text-xs text-muted-foreground mt-1">⚠️ Note: Browser automation is blocked in this environment</p>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setIsDialogOpen(false)} className="px-4 py-2 text-muted-foreground hover:text-foreground">Cancel</button>
                <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded font-medium">Add Account</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Session Login Dialog */}
      {sessionDialogOpen && selectedAccountForSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border w-full max-w-2xl p-6 rounded-xl shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-bold mb-2">Setup Login Session</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Account: <span className="font-medium text-foreground">{selectedAccountForSession.accountName}</span> ({selectedAccountForSession.email})
            </p>

            <div className="bg-secondary/30 border border-border rounded-lg p-4 mb-6 space-y-3">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Key className="w-4 h-4" />
                Instructions:
              </h3>
              <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                <li>On your <strong>local machine</strong>, run: <code className="bg-background px-2 py-0.5 rounded text-primary font-mono text-xs">npm run login</code></li>
                <li>A browser window will open - log in to Google with this account</li>
                <li>Complete any 2FA/verification steps</li>
                <li>Wait for the script to detect successful login</li>
                <li>Copy the contents of <code className="bg-background px-2 py-0.5 rounded text-primary font-mono text-xs">gemini_session.json</code></li>
                <li>Paste it below and click "Save Session"</li>
              </ol>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium block">Paste Session JSON:</label>
              <textarea
                className="w-full bg-background border border-border rounded px-3 py-2 font-mono text-xs h-48 resize-none"
                placeholder='{"cookies":[...],"origins":[...]}'
                value={sessionJsonInput}
                onChange={(e) => setSessionJsonInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                ⚠️ This session will be stored in the database and used for all future extractions.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-6">
              <button
                type="button"
                onClick={() => {
                  setSessionDialogOpen(false);
                  setSessionJsonInput("");
                  setSelectedAccountForSession(null);
                }}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
                disabled={saveSessionMutation.isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSession}
                disabled={saveSessionMutation.isPending || !sessionJsonInput.trim()}
                className="bg-primary text-primary-foreground px-6 py-2 rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
              >
                {saveSessionMutation.isPending ? 'Saving...' : 'Save Session'}
              </button>
            </div>
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
              <p className="text-sm text-muted-foreground truncate mb-2">{account.email}</p>

              {/* Session Status */}
              <div className="mb-4 flex items-center justify-between">
                {account.sessionData ? (
                  <span className="flex items-center gap-1 text-xs font-medium text-blue-500 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                    <Key className="w-3 h-3" /> Session Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-amber-500 bg-amber-500/10 px-2 py-1 rounded border border-amber-500/20">
                    <Key className="w-3 h-3" /> No Session
                  </span>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSyncSession(account)}
                    disabled={syncSessionMutation.isPending}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 rounded border border-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Open browser for manual login (Local only)"
                  >
                    <LogIn className="w-3 h-3" />
                    {syncSessionMutation.isPending ? 'Syncing...' : (account.sessionData ? 'Re-login' : 'Login')}
                  </button>
                  <button
                    onClick={() => handleOpenSessionDialog(account)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium bg-secondary/50 text-muted-foreground hover:bg-secondary rounded border border-border transition-colors"
                    title="Manual paste (for remote environments)"
                  >
                    <Key className="w-3 h-3" />
                  </button>
                </div>
              </div>

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
