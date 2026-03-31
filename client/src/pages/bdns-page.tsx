  import { LayoutShell } from "@/components/layout-shell";
  import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
  import { apiRequest } from "@/lib/queryClient";
  import { Button } from "@/components/ui/button";
  import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
  import { useToast } from "@/hooks/use-toast";
  import { RefreshCw, Trash2, CheckCircle, CalendarDays, Building, X } from "lucide-react";
  import { Badge } from "@/components/ui/badge";
  import { Link } from "wouter";
  import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

  export default function BdnsPage() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: syncState } = useQuery({ queryKey: ["/api/scraping-state/bdns"] });

    const { data: bdnsGrants, isLoading } = useQuery({ queryKey: ["/api/bdns-grants"] });

    const scrapeMutation = useMutation({
      mutationFn: async () => await apiRequest("POST", "/api/grants/scrape"),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/bdns-grants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/scraping-state/bdns"] });
        toast({ title: "Buscando en BDNS..." });
      },
    });

    const updateStatusMutation = useMutation({
      mutationFn: async ({ id, status }: { id: number; status: "accepted" | "rejected" }) => {
        await apiRequest("PATCH", `/api/bdns-grants/${id}/status`, { status });
      },
      onSuccess: (_, variables) => {
        queryClient.invalidateQueries({ queryKey: ["/api/bdns-grants"] });
        toast({ title: variables.status === "accepted" ? "Subvención guardada" : "Subvención descartada" });
      },
    });

    const deleteMutation = useMutation({
      mutationFn: async (id: number) => await fetch(`/api/bdns-grants/${id}`, { method: "DELETE" }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/bdns-grants"] });
        toast({ title: "Subvención eliminada" });
      }
    });

    // SEPARAMOS LAS SUBVENCIONES POR ESTADO
    const pendingGrants = bdnsGrants?.filter((g: any) => g.status === "pending" || !g.status) || [];
    const acceptedGrants = bdnsGrants?.filter((g: any) => g.status === "accepted") || [];

    // Función para renderizar las tarjetas (para no repetir código)
    const renderGrants = (grantsList: any[], isPendingSection: boolean) => {
      if (grantsList.length === 0) return <p className="text-slate-500 py-4">No hay subvenciones en esta sección.</p>;

      return (
        <div className="grid gap-6 mt-4">
          {grantsList.map((grant: any) => (
            <Card key={grant.id} className="hover:shadow-md transition-all">
              <CardHeader>
                <Badge className="w-fit mb-2">{grant.codigoBDNS}</Badge>
                {/* Quitamos line-clamp-2 para que se lea el título completo */}
                <CardTitle className="text-xl leading-snug">{grant.titulo}</CardTitle>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Aquí mapeamos las empresas guardadas desde el nuevo JSON de la IA */}
                {grant.iaAnalisis?.matches?.map((match: any, index: number) => (
                  <div key={index} className={`p-4 rounded-md border ${match.cuadra ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}>
                    <h4 className="font-bold flex items-center gap-2 mb-2">
                      <Building className="h-4 w-4" /> 
                      Empresa: {match.companyName}
                      {match.cuadra && <Badge variant="outline" className="bg-green-100 text-green-800 border-none">Aceptada por IA</Badge>}
                    </h4>
                    {/* TEXTO COMPLETO DE LA IA */}
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                      <strong className="text-slate-900">Motivo: </strong> 
                      {match.razon}
                    </p>
                  </div>
                ))}

                {/* Soporte retroactivo si aún tienes el formato viejo en DB */}
                {grant.iaAnalisis?.razon && !grant.iaAnalisis?.matches && (
                   <div className="p-4 rounded-md bg-blue-50 border border-blue-200">
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                        <strong>Veredicto previo IA: </strong>{grant.iaAnalisis.razon}
                      </p>
                   </div>
                )}
              </CardContent>

              <CardFooter className="justify-between border-t border-slate-100 pt-4 bg-slate-50/50">
                <Link href={`/bdns-grants/${grant.id}`}>
                  <Button variant="outline" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200">
                    Ver detalles completos
                  </Button>
                </Link>

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
              <h1 className="text-3xl font-display font-bold text-slate-900">Subvenciones BDNS</h1>
              <p className="text-slate-500">Resultados analizados por IA desde la Base de Datos Nacional de Subvenciones</p>
              {/* NUEVO: Mostrar la fecha */}
              {syncState?.lastSync && (
                <p className="text-sm text-slate-500 mt-2 flex items-center gap-1 font-medium bg-slate-100 w-fit px-2 py-1 rounded-md">
                  <CalendarDays className="h-4 w-4" />
                  Última sincronización: {new Date(syncState.lastSync).toLocaleString("es-ES", {
                    dateStyle: "long",
                    timeStyle: "short"
                  })}
                </p>
              )}
            </div>
            <Button onClick={() => scrapeMutation.mutate()} disabled={scrapeMutation.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${scrapeMutation.isPending ? "animate-spin" : ""}`} />
              {scrapeMutation.isPending ? "Sincronizando..." : "Explorar BDNS"}
            </Button>
          </div>

          {isLoading ? (
            <div>Cargando...</div>
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