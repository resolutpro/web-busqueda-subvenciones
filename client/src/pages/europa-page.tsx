import { LayoutShell } from "@/components/layout-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Trash2, Globe, Building, ExternalLink, CalendarDays, CheckCircle, X, Info, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: "accepted" | "rejected" }) => {
      await apiRequest("PATCH", `/api/ted-grants/${id}/status`, { status });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ted-grants"] });
      toast({ title: variables.status === "accepted" ? "Ayuda europea guardada" : "Ayuda descartada" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => await fetch(`/api/ted-grants/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ted-grants"] });
      toast({ title: "Ayuda eliminada definitivamente" });
    }
  });

  // SEPARAMOS LAS SUBVENCIONES POR ESTADO
  const pendingGrants = tedGrants?.filter((g: any) => g.status === "pending" || !g.status) || [];
  const acceptedGrants = tedGrants?.filter((g: any) => g.status === "accepted") || [];

  // Función para renderizar las tarjetas
  const renderGrants = (grantsList: any[], isPendingSection: boolean) => {
    if (grantsList.length === 0) {
      return (
        <div className="text-center py-20 bg-white rounded-xl border border-slate-200 mt-4">
           <Globe className="h-12 w-12 text-slate-300 mx-auto mb-4" />
           <h3 className="text-lg font-medium text-slate-900">Ningún fondo europeo en esta sección</h3>
           <p className="text-slate-500">No se han detectado convocatorias aquí.</p>
        </div>
      );
    }

    return (
      <div className="grid gap-6 mt-4">
        {grantsList.map((grant: any) => (
          <Dialog key={grant.id}>
            <Card className="hover:shadow-md transition-all border-purple-100 flex flex-col">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-none">{grant.identificador}</Badge>

                  {/* FECHAS DE APERTURA Y CIERRE */}
                  <div className="flex gap-3">
                    {grant.fechaPublicacion && (
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        Abre: {new Date(grant.fechaPublicacion).toLocaleDateString()}
                      </span>
                    )}
                    {grant.detallesExtraidos?.fechaCierre && (
                      <span className="text-xs text-red-500 font-medium flex items-center gap-1 bg-red-50 px-2 py-0.5 rounded-full">
                        <Clock className="h-3 w-3" />
                        Cierra: {new Date(grant.detallesExtraidos.fechaCierre).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <CardTitle className="text-xl leading-snug">{grant.titulo}</CardTitle>
                {grant.detallesExtraidos?.programa && (
                  <p className="text-sm text-purple-600 font-medium mt-1">{grant.detallesExtraidos.programa}</p>
                )}
              </CardHeader>

              <CardContent className="space-y-4 flex-grow">
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

                {/* Fallback antiguo o modo prueba */}
                {(grant.aiAnalysis?.razon || grant.aiAnalysis?.mensaje) && !grant.aiAnalysis?.matches && (
                   <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed p-4 bg-purple-50 rounded-md">
                      <strong>Info IA: </strong>{grant.aiAnalysis.razon || grant.aiAnalysis.mensaje}
                   </p>
                )}

                {/* BOTÓN PARA ABRIR LA DESCRIPCIÓN */}
                <div className="pt-2">
                  <DialogTrigger asChild>
                    <Button variant="secondary" className="w-full text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-100">
                      <Info className="h-4 w-4 mr-2" /> Leer descripción completa
                    </Button>
                  </DialogTrigger>
                </div>
              </CardContent>

              <CardFooter className="justify-between border-t border-slate-100 pt-4 bg-slate-50/50 mt-auto">
                {grant.urlDetalle ? (
                  <a href={grant.urlDetalle} target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1 font-medium">
                    Ver en Portal SEDIA <ExternalLink className="h-4 w-4" />
                  </a>
                ) : <div/>}

                {/* BOTONES DE ACCIÓN */}
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
                  <Button variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => deleteMutation.mutate(grant.id)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Eliminar
                  </Button>
                )}
              </CardFooter>
            </Card>

            {/* CONTENIDO DEL DIALOG (MODAL) CON LA DESCRIPCIÓN */}
            <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-200 border-none">{grant.identificador}</Badge>
                  {grant.detallesExtraidos?.fechaCierre && (
                    <Badge variant="outline" className="border-red-200 text-red-600 bg-red-50">
                      Cierra: {new Date(grant.detallesExtraidos.fechaCierre).toLocaleDateString()}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-2xl text-slate-900 leading-tight pr-6">
                  {grant.titulo}
                </DialogTitle>
                {grant.detallesExtraidos?.programa && (
                  <p className="text-sm font-medium text-purple-600">{grant.detallesExtraidos.programa}</p>
                )}
              </DialogHeader>

              <div className="mt-4 flex-1 overflow-y-auto pr-4 text-slate-700 text-sm leading-relaxed space-y-4
                  [&>h2]:text-lg [&>h2]:font-bold [&>h2]:text-slate-900 [&>h2]:mt-6 [&>h2]:mb-2 [&>h2]:underline
                  [&>ul]:list-disc [&>ul]:pl-6 [&>ul]:mb-4 [&>ul>li]:mb-1
                  [&>ol]:list-decimal [&>ol]:pl-6 [&>ol]:mb-4 [&>ol>li]:mb-1
                  [&>p]:mb-3 [&>strong]:text-slate-900"
                dangerouslySetInnerHTML={{ 
                  __html: grant.detallesExtraidos?.descripcion && grant.detallesExtraidos.descripcion !== "Sin descripción disponible" 
                    ? grant.detallesExtraidos.descripcion 
                    : "<p class='text-slate-500 italic'>No hay descripción detallada disponible para esta convocatoria.</p>" 
                }}
              />
            </DialogContent>
          </Dialog>
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