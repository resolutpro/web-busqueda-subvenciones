import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type InsertGrant } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface GrantFilters {
  search?: string;
  source?: string;
  reviewStatus?: string;
}

export function useGrants(filters?: GrantFilters) {
  // Construct query key based on filters to enable caching per filter set
  const queryKey = [api.grants.list.path, filters];

  return useQuery({
    queryKey,
    queryFn: async () => {
      const url = new URL(api.grants.list.path, window.location.origin);
      if (filters?.search) url.searchParams.append("search", filters.search);
      if (filters?.source) url.searchParams.append("source", filters.source);
      if (filters?.reviewStatus) url.searchParams.append("reviewStatus", filters.reviewStatus);

      const res = await fetch(url.toString(), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch grants");
      return api.grants.list.responses[200].parse(await res.json());
    },
  });
}

export function useGrant(id: number) {
  return useQuery({
    queryKey: [api.grants.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.grants.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch grant details");
      return api.grants.get.responses[200].parse(await res.json());
    },
  });
}

export function useCreateGrant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertGrant) => {
      const res = await fetch(api.grants.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to create grant");
      return api.grants.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.grants.list.path] });
      toast({
        title: "Grant Created",
        description: "New grant opportunity added to the system.",
      });
    },
  });
}

export function useDeleteGrant() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.grants.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to delete grant");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.grants.list.path] });
      toast({
        title: "Subvención eliminada",
        description: "La subvención ha sido eliminada correctamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la subvención.",
        variant: "destructive",
      });
    }
  });
}

export function useScanStatus() {
  return useQuery({
    queryKey: [api.grants.getScanStatus.path],
    queryFn: async () => {
      const url = buildUrl(api.grants.getScanStatus.path, {});
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch scan status");
      return res.json();
    },
    // We can refetch this every minute to keep the dashboard fresh
    refetchInterval: 60000,
  });
}
