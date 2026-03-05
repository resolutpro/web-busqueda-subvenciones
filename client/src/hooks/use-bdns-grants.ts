import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export function useBdnsGrants() {
  return useQuery({
    queryKey: ["/api/bdns-grants"],
  });
}

export function useBdnsGrant(id: string) {
  return useQuery({
    queryKey: [`/api/bdns-grants/${id}`],
    enabled: !!id,
  });
}

export function useDeleteBdnsGrant() {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/bdns-grants/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Error al borrar");
    },
    onSuccess: () => {
      // Refresca la lista automáticamente al borrar
      queryClient.invalidateQueries({ queryKey: ["/api/bdns-grants"] });
    }
  });
}