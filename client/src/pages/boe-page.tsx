import { LayoutShell } from "@/components/layout-shell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, CheckCircle, BookOpen, Building, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
        ) : boeGrants?.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
             <CheckCircle className="h-12 w-12 text-slate-300 mx-auto mb-4" />
             <h3 className="text-lg font-medium text-slate-900">Todo al día</h3>
             <p className="text-slate-500">No hay anuncios nuevos del BOE que encajen con tus empresas.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {boeGrants?.map((grant: any) => (
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
              </Card>
            ))}
          </div>
        )}
      </div>
    </LayoutShell>
  );
}