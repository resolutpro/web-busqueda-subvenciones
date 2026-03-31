import { LayoutShell } from "@/components/layout-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Trash2, Globe, Building, ExternalLink, CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function EuropaPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tedGrants, isLoading } = useQuery({ queryKey: ["/api/ted-grants"] });
  const { data: tedState } = useQuery({ queryKey: ["/api/scraping-state/ted"] });

  const syncTedMutation = useMutation({
    mutationFn: async () => await apiRequest("POST", "/api/scrape/ted"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ted-grants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scraping-state/ted"] });
      toast({ title: "Buscando en Europa (F&T)..." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => await fetch(`/api/ted-grants/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ted-grants"] }),
  });

  return (
    <LayoutShell>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-2">
              <Globe className="h-8 w-8 text-purple-600" /> Ayudas Europeas (F&T)
            </h1>
            <p className="text-slate-500">Última actualización: {tedState?.lastSync ? new Date(tedState.lastSync).toLocaleString() : 'Nunca'}</p>
          </div>
          <Button onClick={() => syncTedMutation.mutate()} disabled={syncTedMutation.isPending} className="bg-purple-600 hover:bg-purple-700 text-white">
            <RefreshCw className={`mr-2 h-4 w-4 ${syncTedMutation.isPending ? "animate-spin" : ""}`} />
            {syncTedMutation.isPending ? "Sincronizando..." : "Sincronizar F&T Portal"}
          </Button>
        </div>

        {isLoading ? (
          <div>Cargando convocatorias europeas...</div>
        ) : tedGrants?.length === 0 ? (
           <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
             <Globe className="h-12 w-12 text-slate-300 mx-auto mb-4" />
             <h3 className="text-lg font-medium text-slate-900">Ningún fondo europeo pendiente</h3>
             <p className="text-slate-500">No se han detectado nuevas convocatorias europeas que encajen.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {tedGrants?.map((grant: any) => (
              <Card key={grant.id} className="hover:shadow-md transition-all border-purple-100">
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-none">{grant.identificador}</Badge>
                    {grant.fechaPublicacion && (
                       <span className="text-xs text-slate-500 flex items-center gap-1">
                         <CalendarDays className="h-3 w-3" />
                         {new Date(grant.fechaPublicacion).toLocaleDateString()}
                       </span>
                    )}
                  </div>
                  <CardTitle className="text-xl leading-snug">{grant.titulo}</CardTitle>
                </CardHeader>

                <CardContent className="space-y-4">
                  {grant.aiAnalysis?.matches?.filter((m: any) => m.cuadra).map((match: any, index: number) => (
                    <div key={index} className={`p-4 rounded-md border ${match.cuadra ? 'bg-purple-50 border-purple-200' : 'bg-slate-50 border-slate-200'}`}>
                      <h4 className="font-bold flex items-center gap-2 mb-2">
                        <Building className="h-4 w-4" /> 
                        {match.companyName}
                        {match.cuadra && <Badge variant="outline" className="bg-purple-100 text-purple-800 border-none">Aceptada</Badge>}
                      </h4>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        <strong className="text-slate-900">Evaluación: </strong> 
                        {match.razon}
                      </p>
                    </div>
                  ))}

                  {/* Fallback antiguo */}
                  {grant.aiAnalysis?.razon && !grant.aiAnalysis?.matches && (
                     <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed p-4 bg-purple-50 rounded-md">
                        <strong>Evaluación: </strong>{grant.aiAnalysis.razon}
                     </p>
                  )}
                </CardContent>

                <CardFooter className="justify-between border-t border-slate-100 pt-4">
                  {grant.urlDetalle ? (
                    <a href={grant.urlDetalle} target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1 font-medium">
                      Ver en Portal SEDIA <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : <div/>}
                  <Button variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => deleteMutation.mutate(grant.id)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Descartar
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </LayoutShell>
  );
}