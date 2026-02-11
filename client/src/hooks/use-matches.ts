import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useMatches() {
  return useQuery({
    queryKey: [api.matches.list.path],
    queryFn: async () => {
      const res = await fetch(api.matches.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matches");
      return api.matches.list.responses[200].parse(await res.json());
    },
  });
}

export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number, status: 'new' | 'viewed' | 'saved' | 'dismissed' | 'applied' }) => {
      const url = buildUrl(api.matches.update.path, { id });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to update match status");
      return api.matches.update.responses[200].parse(await res.json());
    },
    onSuccess: (_, variables) => {
      // Invalidate both the list and the specific grant detail that might show this match
      queryClient.invalidateQueries({ queryKey: [api.matches.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.grants.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.grants.get.path] }); // Invalidate generic grant details

      const actionMap = {
        'saved': 'Grant saved to favorites.',
        'dismissed': 'Grant dismissed.',
        'applied': 'Application status updated.',
        'viewed': null,
        'new': null
      };

      const message = actionMap[variables.status];
      if (message) {
        toast({ title: "Updated", description: message });
      }
    },
  });
}
