import { LayoutShell } from "@/components/layout-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, CheckCircle, BookOpen, Building, ExternalLink, X, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function BoePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: boeGrants, isLoading } = useQuery({ queryKey: ["/api/boe-grants"] });
  const { data: boeState } = useQuery({ queryKey: ["/api/scraping-state/boe"] });

  const syncBoeMutation = useMutation({
    mutationFn: async () => await apiRequest("POST", "/api/scrape/boe"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boe-grants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scraping-state/boe"] });
      toast({ title: "Analizando BOE..." });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "accepted" | "rejected" }) => {
      await apiRequest("PATCH", `/api/boe-grants/${id}/status`, { status });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/boe-grants"] });
      toast({ title: variables.status === "accepted" ? "Anuncio guardado" : "Anuncio descartado" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => await fetch(`/api/boe-grants/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/boe-grants"] });
      toast({ title: "Anuncio eliminado" });
    }
  });

  // SEPARAMOS LAS SUBVENCIONES POR ESTADO
  const pendingGrants = boeGrants?.filter((g: any) => g.status === "pending" || !g.status) || [];
  const acceptedGrants = boeGrants?.filter((g: any) => g.status === "accepted") || [];

  // Función para renderizar las tarjetas (para no repetir código)
  const renderGrants = (grantsList: any[], isPendingSection: boolean) => {
    if (grantsList.length === 0) {
      return (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200 mt-4">
           <CheckCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
           <h3 className="text-lg font-medium text-slate-900">Todo al día</h3>
           <p className="text-slate-500">No hay anuncios en esta sección.</p>
        </div>
      );
    }

    return (
      <div className="grid gap-6 mt-4">
        {grantsList.map((grant: any) => (
          <Card key={grant.id} className="hover:shadow-md transition-all">
            <CardHeader>
              <div className="flex justify-between items-start">
                <Badge className="bg-slate-100 text-slate-800 hover:bg-slate-200 border-none mb-2">{grant.identificador}</Badge>
                <div className="flex gap-2">
                  {grant.urlPdf && (
                    <a href={grant.urlPdf} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1 text-blue-600 hover:underline">
                      PDF Oficial <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              <CardTitle className="text-xl leading-snug">{grant.titulo}</CardTitle>
              <p className="text-sm text-slate-500 flex items-center mt-2">
                <Building className="mr-1.5 h-4 w-4 text-slate-400" />
                {grant.departamento}
              </p>
            </CardHeader>

            <CardContent className="space-y-4">
              {grant.aiAnalysis?.matches?.filter((m: any) => m.cuadra).map((match: any, index: number) => (
                <div key={index} className={`p-4 rounded-md border ${match.cuadra ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                  <h4 className="font-bold flex items-center gap-2 mb-2">
                    <Building className="h-4 w-4" /> 
                    {match.companyName}
                    {match.cuadra && <Badge variant="outline" className="bg-green-100 text-green-800 border-none">Interesante</Badge>}
                  </h4>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                    <strong className="text-slate-900">Motivo (IA): </strong> 
                    {match.razon}
                  </p>
                </div>
              ))}

              {/* Fallback antiguo formato */}
              {grant.aiAnalysis?.razon && !grant.aiAnalysis?.matches && (
                 <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed p-4 bg-slate-50 rounded-md">
                    <strong>Motivo IA: </strong>{grant.aiAnalysis.razon}
                 </p>
              )}
            </CardContent>

            <CardFooter className="justify-end border-t border-slate-100 pt-4 bg-slate-50/50">
              {/* SÓLO MOSTRAMOS LOS BOTONES DE ACCIÓN SI ESTAMOS EN LA PESTAÑA DE PENDIENTES */}
              {isPendingSection ? (
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    onClick={() => updateStatusMutation.mutate({ id: grant.id, status: "rejected" })}
                  >
                    <X className="h-4 w-4 mr-1" /> Rechazar
                  </Button>
                  <Button 
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => updateStatusMutation.mutate({ id: grant.id, status: "accepted" })}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" /> Aceptar
                  </Button>
                </div>
              ) : (
                /* Botón para eliminar definitivamente si ya la habíamos aceptado y nos arrepentimos */
                <Button variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => deleteMutation.mutate(grant.id)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Eliminar definitivamente
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <LayoutShell>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-2">
              <BookOpen className="h-8 w-8 text-slate-700" /> Anuncios del BOE
            </h1>
            <p className="text-slate-500">Última actualización: {boeState?.lastSync ? new Date(boeState.lastSync).toLocaleString() : 'Nunca'}</p>
          </div>
          <Button onClick={() => syncBoeMutation.mutate()} disabled={syncBoeMutation.isPending} variant="outline">
            <RefreshCw className={`mr-2 h-4 w-4 ${syncBoeMutation.isPending ? "animate-spin" : ""}`} />
            {syncBoeMutation.isPending ? "Sincronizando..." : "Sincronizar Diario BOE"}
          </Button>
        </div>

        {isLoading ? (
          <div>Cargando anuncios relevantes del BOE...</div>
        ) : (
          <Tabs defaultValue="pendientes" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="pendientes">
                Pendientes por revisar
                <Badge variant="secondary" className="ml-2 bg-slate-200">{pendingGrants.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="aceptadas">
                Aceptadas
                <Badge variant="secondary" className="ml-2 bg-slate-200">{acceptedGrants.length}</Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pendientes">
              {renderGrants(pendingGrants, true)}
            </TabsContent>

            <TabsContent value="aceptadas">
              {renderGrants(acceptedGrants, false)}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </LayoutShell>
  );
}