import { LayoutShell } from "@/components/layout-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Trash2, CheckCircle, CalendarDays, Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

export default function BdnsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: bdnsGrants, isLoading } = useQuery({ queryKey: ["/api/bdns-grants"] });

  const scrapeMutation = useMutation({
    mutationFn: async () => await apiRequest("POST", "/api/grants/scrape"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bdns-grants"] });
      toast({ title: "Buscando en BDNS..." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => await fetch(`/api/bdns-grants/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bdns-grants"] }),
  });

  return (
    <LayoutShell>
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">Subvenciones BDNS</h1>
            <p className="text-slate-500">Resultados analizados por IA desde la Base de Datos Nacional de Subvenciones</p>
          </div>
          <Button onClick={() => scrapeMutation.mutate()} disabled={scrapeMutation.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${scrapeMutation.isPending ? "animate-spin" : ""}`} />
            {scrapeMutation.isPending ? "Sincronizando..." : "Explorar BDNS"}
          </Button>
        </div>

        {isLoading ? (
          <div>Cargando...</div>
        ) : (
          <div className="grid gap-6">
            {bdnsGrants?.map((grant: any) => (
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
                        {match.cuadra && <Badge variant="outline" className="bg-green-100 text-green-800 border-none">Aceptada</Badge>}
                      </h4>
                      {/* TEXTO COMPLETO DE LA IA: Quitamos clases que cortan y usamos texto normal legible */}
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

                <CardFooter className="justify-between border-t border-slate-100 pt-4">
                  <Link href={`/bdns-grants/${grant.id}`}>
                    <Button variant="outline" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200">
                      Analizar a fondo
                    </Button>
                  </Link>
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