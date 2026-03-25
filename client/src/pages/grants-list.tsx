import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useGrants } from "@/hooks/use-grants";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { MatchScoreBadge } from "@/components/match-score-badge";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Filter,
  CalendarDays,
  Euro,
  Building,
  ChevronRight,
  RefreshCw,
  Trash2,
  CheckCircle
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function GrantsListPage() {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<string>("");

  // --- QUERIES ---
  // 1. Subvenciones normales del sistema
  const { data: grants, isLoading: isLoadingGrants } = useGrants({
    search,
    scope: scope === "all" ? undefined : scope,
  });

  // 2. Subvenciones obtenidas mediante Scraping BDNS
  const { data: bdnsGrants, isLoading: isLoadingBdns } = useQuery({
    queryKey: ["/api/bdns-grants"],
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // 3. Subvenciones obtenidas mediante Scraping BOE
  // Query para obtener el estado del BOE
  const { data: boeState } = useQuery({
    queryKey: ["/api/scraping-state/boe"],
  });

  // Query para obtener los registros del BOE
  const { data: boeGrants, isLoading: loadingBoe } = useQuery({
    queryKey: ["/api/boe-grants"],
  });

  // 4. Subvenciones obtenidas mediante la API TED
  const { data: tedState } = useQuery({ queryKey: ["/api/scraping-state/ted"] });
  const { data: tedGrants, isLoading: loadingTed } = useQuery({ queryKey: ["/api/ted-grants"] });

  const lastTedSyncDate = tedState?.lastSync 
    ? format(new Date(tedState.lastSync), "dd/MM/yyyy HH:mm", { locale: es }) 
    : "Nunca";

  const lastSyncDate = boeState?.lastSync 
    ? format(new Date(boeState.lastSync), "dd/MM/yyyy HH:mm", { locale: es }) 
    : "Nunca";

  // --- MUTATIONS ---
  // Sincronizar (Scraping manual BDNS)
  const scrapeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/grants/scrape");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/grants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bdns-grants"] }); // Refrescamos BDNS también
      toast({
        title: "Sincronización en curso",
        description: "El sistema está buscando nuevas subvenciones de la BDNS.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo conectar con el servicio de la BDNS.",
        variant: "destructive",
      });
    },
  });

  // Borrar (Descartar) subvención BDNS
  const deleteBdnsMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/bdns-grants/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bdns-grants"] });
      toast({
        title: "Subvención descartada",
        description: "Se ha eliminado correctamente de tu lista.",
      });
    },
  });

  // Sincronizar BOE
  const syncBoeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scrape/boe");
      return res.json();
    },
    onSuccess: () => {
      // Esto recarga las listas automáticamente para mostrar los datos nuevos
      queryClient.invalidateQueries({ queryKey: ["/api/boe-grants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scraping-state/boe"] });
      toast({
        title: "¡BOE Sincronizado!",
        description: "Se han buscado y analizado los últimos anuncios.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Hubo un problema al sincronizar con el BOE.",
        variant: "destructive",
      });
    },
  });

  const syncTedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/scrape/ted");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ted-grants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scraping-state/ted"] });
      toast({
        title: "¡TED Sincronizado!",
        description: "Se han buscado y analizado fondos europeos.",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Problema al sincronizar TED.", variant: "destructive" });
    },
  });

  const deleteTedMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/ted-grants/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ted-grants"] });
      toast({ title: "Fondo europeo descartado" });
    },
  });

  return (
    <LayoutShell>
      <div className="container mx-auto p-6">

        {/* --- HEADER --- */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">
              Oportunidades de Subvención
            </h1>
            <p className="text-slate-500 mt-1">
              Explora las ayudas emparejadas con tu perfil
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => scrapeMutation.mutate()}
              disabled={scrapeMutation.isPending}
              className="flex items-center gap-2 border-blue-200 hover:bg-blue-50 text-blue-700"
            >
              <RefreshCw className={`h-4 w-4 ${scrapeMutation.isPending ? "animate-spin" : ""}`} />
              {scrapeMutation.isPending ? "Buscando en BDNS..." : "Explorar BDNS"}
            </Button>

            <Button 
              onClick={() => syncBoeMutation.mutate()} 
              disabled={syncBoeMutation.isPending}
              variant="outline"
              size="sm"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncBoeMutation.isPending ? 'animate-spin' : ''}`} />
              {syncBoeMutation.isPending ? "Analizando BOE..." : "Sincronizar BOE"}
            </Button>

            <Button 
              onClick={() => syncTedMutation.mutate()} 
              disabled={syncTedMutation.isPending}
              variant="outline"
              size="sm"
              className="border-purple-200 hover:bg-purple-50 text-purple-700"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncTedMutation.isPending ? 'animate-spin' : ''}`} />
              {syncTedMutation.isPending ? "Consultando F&T..." : "Sincronizar Europa (F&T)"}
            </Button>
            
          </div>
        </div>

        {/* --- FILTERS --- */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar subvenciones..."
              className="pl-9 bg-slate-50 border-slate-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Todos los Ámbitos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los Ámbitos</SelectItem>
                <SelectItem value="Nacional">Nacional</SelectItem>
                <SelectItem value="Autonomico">Autonómico</SelectItem>
                <SelectItem value="Europeo">Europeo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* --- TABS PESTAÑAS --- */}
        <Tabs defaultValue="system" className="w-full">
          <TabsList className="mb-6 bg-slate-100 p-1 rounded-lg">
            <TabsTrigger value="system" className="rounded-md">Catálogo General</TabsTrigger>
            <TabsTrigger value="bdns" className="rounded-md flex items-center gap-2">
              BDNS 
              {bdnsGrants && bdnsGrants.length > 0 && (
                <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full">{bdnsGrants.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="boe" className="rounded-md">BOE</TabsTrigger>
            <TabsTrigger value="ted" className="rounded-md text-purple-700">Europa (F&T)</TabsTrigger>
          </TabsList>

          {/* ==============================================
              CONTENIDO 1: SUBVENCIONES DEL SISTEMA
              ============================================== */}
          <TabsContent value="system" className="space-y-4">
            {isLoadingGrants ? (
              Array(5)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-xl border border-slate-200 p-6 flex gap-4"
                  >
                    <Skeleton className="h-16 w-16 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  </div>
                ))
            ) : grants?.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-medium text-slate-900">
                  No se encontraron subvenciones
                </h3>
                <p className="text-slate-500">
                  Prueba ajustando los filtros o términos de búsqueda.
                </p>
              </div>
            ) : (
              grants?.map((grant) => (
                <Link key={grant.id} href={`/grants/${grant.id}`}>
                  <div className="group bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer relative">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-shrink-0 flex md:flex-col items-center gap-2 md:w-24 md:border-r border-slate-100 md:pr-6">
                        <MatchScoreBadge
                          score={grant.match?.score || 0}
                          size="md"
                        />
                        <span className="text-xs text-slate-400 hidden md:block text-center">
                          Compatibilidad
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                              {grant.title}
                            </h3>
                            <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-500">
                              <div className="flex items-center">
                                <Building className="mr-1.5 h-4 w-4 text-slate-400" />
                                {grant.organismo}
                              </div>
                              <div className="flex items-center">
                                <CalendarDays className="mr-1.5 h-4 w-4 text-slate-400" />
                                Fecha límite:{" "}
                                {grant.endDate
                                  ? new Date(grant.endDate).toLocaleDateString()
                                  : "Abierta"}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 transition-colors hidden sm:block" />
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-50">
                          <div className="flex flex-wrap gap-2">
                            <Badge
                              variant="secondary"
                              className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                            >
                              {grant.scope}
                            </Badge>
                            {(grant.tags as string[])?.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-slate-600 border-slate-200"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                          {grant.budget && (
                            <div className="flex items-center font-medium text-slate-900 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                              <Euro className="mr-1.5 h-4 w-4 text-emerald-600" />
                              {grant.budget.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </TabsContent>

          {/* ==============================================
              CONTENIDO 2: SUBVENCIONES BDNS (IA)
              ============================================== */}
          <TabsContent value="bdns">
            {isLoadingBdns ? (
               <div className="flex justify-center p-12 text-slate-500">Cargando subvenciones de BDNS...</div>
            ) : !bdnsGrants || bdnsGrants.length === 0 ? (
               <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                 <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-400">
                   <CheckCircle className="h-6 w-6" />
                 </div>
                 <h3 className="text-lg font-medium text-slate-900">
                   Todo al día
                 </h3>
                 <p className="text-slate-500 max-w-sm mx-auto mt-2">
                   No hay subvenciones nuevas de la BDNS que cuadren con tu perfil. ¡Usa el botón "Explorar BDNS" para forzar una búsqueda con IA!
                 </p>
               </div>
            ) : (
               <div className="grid gap-4 md:grid-cols-2">
                 {bdnsGrants.map((bdns: any) => (
                   <Card key={bdns.id} className="flex flex-col border-blue-100 hover:shadow-md transition-all">
                     <CardHeader className="pb-3">
                       <div className="flex justify-between items-start mb-2">
                         <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded">BDNS: {bdns.codigoBDNS}</span>
                         {bdns.fechaRegistro && (
                           <span className="text-[10px] text-slate-500 flex items-center gap-1">
                             <CalendarDays className="h-3 w-3" />
                             {new Date(bdns.fechaRegistro).toLocaleDateString()}
                           </span>
                         )}
                       </div>
                       <CardTitle className="text-base leading-tight line-clamp-2">{bdns.titulo}</CardTitle>
                       <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{bdns.organoConvocante}</p>
                     </CardHeader>

                     <CardContent className="flex-1 pb-4">
                       {bdns.iaAnalisis && bdns.iaAnalisis.cuadra && (
                         <div className="text-sm text-green-800 bg-green-50/50 p-3 rounded-md border border-green-100">
                           <strong className="flex items-center gap-1 mb-1 text-green-700">
                             <CheckCircle className="h-4 w-4" /> La IA opina:
                           </strong>
                           <span className="line-clamp-3 leading-snug text-xs">{bdns.iaAnalisis.razon}</span>
                         </div>
                       )}
                     </CardContent>

                     <CardFooter className="flex justify-between border-t border-slate-50 pt-4 pb-4">
                       <Link href={`/bdns-grants/${bdns.id}`}>
                         <Button variant="outline" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50">
                           Analizar a fondo
                         </Button>
                       </Link>
                       <Button
                         variant="ghost"
                         size="sm"
                         className="text-red-400 hover:text-red-700 hover:bg-red-50"
                         onClick={() => {
                           if (confirm("¿Seguro que quieres descartar esta subvención?")) {
                             deleteBdnsMutation.mutate(bdns.id);
                           }
                         }}
                         disabled={deleteBdnsMutation.isPending}
                       >
                         <Trash2 className="h-4 w-4 mr-1" /> Descartar
                       </Button>
                     </CardFooter>
                   </Card>
                 ))}
               </div>
            )}
          </TabsContent>

          {/* ==============================================
              CONTENIDO 3: SUBVENCIONES BOE (IA)
              ============================================== */}
          <TabsContent value="boe">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-slate-900">Anuncios del BOE Filtrados por IA</h2>
              <Badge variant="outline" className="text-sm">
                Última actualización: {lastSyncDate}
              </Badge>
            </div>

            {loadingBoe ? (
              <div className="flex justify-center p-12 text-slate-500">Cargando anuncios del BOE...</div>
            ) : boeGrants?.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center text-muted-foreground">
                  <div className="h-12 w-12 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-400">
                    <CheckCircle className="h-6 w-6" />
                  </div>
                  No hay anuncios del BOE relevantes en la base de datos ahora mismo.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {boeGrants?.map((grant: any) => (
                  <Card key={grant.id} className="hover:shadow-md transition-all">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <Badge className="mb-2 bg-slate-100 text-slate-800 hover:bg-slate-200 border-none">{grant.identificador}</Badge>
                          <CardTitle className="text-lg leading-tight">{grant.titulo}</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-slate-500 mb-4">
                        <Building className="inline-block mr-1.5 h-4 w-4 text-slate-400" />
                        {grant.departamento}
                      </p>

                      {grant.aiAnalysis?.razon && (
                        <div className="mb-4 text-sm text-green-800 bg-green-50/50 p-3 rounded-md border border-green-100">
                          <strong className="flex items-center gap-1 mb-1 text-green-700">
                            <CheckCircle className="h-4 w-4" /> Por qué te interesa (IA):
                          </strong>
                          <span className="text-xs leading-snug">{grant.aiAnalysis.razon}</span>
                        </div>
                      )}

                      <div className="flex gap-4 pt-2 border-t border-slate-50">
                        {grant.urlPdf && (
                          <a href={grant.urlPdf} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 font-medium">
                            Ver PDF Oficial
                          </a>
                        )}
                        {grant.urlHtml && (
                          <a href={grant.urlHtml} target="_blank" rel="noopener noreferrer" className="text-sm text-slate-600 hover:text-slate-900 hover:underline flex items-center gap-1 font-medium">
                            Ver versión web
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        
        {/* ==============================================
        CONTENIDO 4: SUBVENCIONES TED
        ============================================== */}
        <TabsContent value="ted">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Subvenciones Europeas (F&T) Evaluadas por IA</h2>
            <Badge variant="outline" className="text-sm border-purple-200 text-purple-700">
              Última actualización: {lastTedSyncDate}
            </Badge>
          </div>

          {loadingTed ? (
            <div className="flex justify-center p-12 text-slate-500">Cargando fondos de TED...</div>
          ) : !tedGrants || tedGrants.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center text-muted-foreground">
                <div className="h-12 w-12 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-4 text-purple-400">
                  <CheckCircle className="h-6 w-6" />
                </div>
                No hay oportunidades europeas relevantes ahora mismo. Usa "Sincronizar TED".
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {tedGrants.map((grant: any) => (
                <Card key={grant.id} className="flex flex-col border-purple-100 hover:shadow-md transition-all">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-1 rounded">
                        {grant.identificador}
                      </span>
                      {grant.fechaPublicacion && (
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(grant.fechaPublicacion).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <CardTitle className="text-base leading-tight line-clamp-2">{grant.titulo}</CardTitle>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-1 flex items-center gap-1">
                      <Building className="h-3 w-3" /> {grant.pais || "Europa"}
                    </p>
                  </CardHeader>

                  <CardContent className="flex-1 pb-4">
                    {grant.aiAnalysis?.razon && (
                      <div className="text-sm text-green-800 bg-green-50/50 p-3 rounded-md border border-green-100">
                        <strong className="flex items-center gap-1 mb-1 text-green-700">
                          <CheckCircle className="h-4 w-4" /> La IA opina:
                        </strong>
                        <span className="line-clamp-3 leading-snug text-xs">{grant.aiAnalysis.razon}</span>
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="flex justify-between border-t border-slate-50 pt-4 pb-4">
                    {grant.urlDetalle && (
                      <a href={grant.urlDetalle} target="_blank" rel="noopener noreferrer" className="text-sm text-purple-600 hover:text-purple-800 font-medium">
                        Ver en EU Funding & Tenders Portal
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        if (confirm("¿Seguro que quieres descartar este fondo?")) deleteTedMutation.mutate(grant.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" /> Descartar
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      </div>
    </LayoutShell>
  );
}