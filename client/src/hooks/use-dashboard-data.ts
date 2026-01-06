import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

// Stocks Hooks
export function useStocks() {
  return useQuery({
    queryKey: [api.stocks.list.path],
    queryFn: async () => {
      const res = await fetch(api.stocks.list.path);
      if (!res.ok) throw new Error("Failed to fetch stocks");
      return api.stocks.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.stocks.create.input>) => {
      const res = await fetch(api.stocks.create.path, {
        method: api.stocks.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create stock");
      return api.stocks.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.stocks.list.path] }),
  });
}

// Industries Hooks
export function useIndustries() {
  return useQuery({
    queryKey: [api.industries.list.path],
    queryFn: async () => {
      const res = await fetch(api.industries.list.path);
      if (!res.ok) throw new Error("Failed to fetch industries");
      return api.industries.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateIndustry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.industries.create.input>) => {
      const res = await fetch(api.industries.create.path, {
        method: api.industries.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create industry");
      return api.industries.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.industries.list.path] }),
  });
}

// Gemini Accounts Hooks
export function useAccounts() {
  return useQuery({
    queryKey: [api.accounts.list.path],
    queryFn: async () => {
      const res = await fetch(api.accounts.list.path);
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return api.accounts.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.accounts.create.input>) => {
      const res = await fetch(api.accounts.create.path, {
        method: api.accounts.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create account");
      return api.accounts.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] }),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.accounts.delete.path, { id });
      const res = await fetch(url, { method: api.accounts.delete.method });
      if (!res.ok) throw new Error("Failed to delete account");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.accounts.list.path] }),
  });
}

// Queue Hooks
export function useQueue() {
  return useQuery({
    queryKey: [api.queue.list.path],
    queryFn: async () => {
      const res = await fetch(api.queue.list.path);
      if (!res.ok) throw new Error("Failed to fetch queue");
      return api.queue.list.responses[200].parse(await res.json());
    },
    refetchInterval: 5000, // Poll every 5s for queue updates
  });
}

export function useCreateQueueItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.queue.create.input>) => {
      const res = await fetch(api.queue.create.path, {
        method: api.queue.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add to queue");
      return api.queue.create.responses[201].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.queue.list.path] }),
  });
}

export function useQueueControl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'start' | 'stop') => {
      const res = await fetch(api.queue.control.path, {
        method: api.queue.control.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Failed to control queue");
      return api.queue.control.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.queue.list.path] }),
  });
}

// Knowledge Graphs Hooks
export function useKGs() {
  return useQuery({
    queryKey: [api.kgs.list.path],
    queryFn: async () => {
      const res = await fetch(api.kgs.list.path);
      if (!res.ok) throw new Error("Failed to fetch KGs");
      return api.kgs.list.responses[200].parse(await res.json());
    },
  });
}

// Config Hooks
export function useConfig() {
  return useQuery({
    queryKey: [api.config.list.path],
    queryFn: async () => {
      const res = await fetch(api.config.list.path);
      if (!res.ok) throw new Error("Failed to fetch config");
      return api.config.list.responses[200].parse(await res.json());
    },
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: z.infer<typeof api.config.update.input>) => {
      const res = await fetch(api.config.update.path, {
        method: api.config.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update config");
      return api.config.update.responses[200].parse(await res.json());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.config.list.path] }),
  });
}

// Logs Hooks
export function useLogs() {
  return useQuery({
    queryKey: [api.logs.list.path],
    queryFn: async () => {
      const res = await fetch(api.logs.list.path);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return api.logs.list.responses[200].parse(await res.json());
    },
    refetchInterval: 2000, // Poll frequently for live logs
  });
}
