import { useRoute } from "wouter";
import { useGrant } from "@/hooks/use-grants";
import { useUpdateMatchStatus } from "@/hooks/use-matches";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchScoreBadge } from "@/components/match-score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, Bookmark, CheckCircle, Wallet, Calendar, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { AiAnalysis } from "@shared/schema";

export default function GrantDetailPage() {
  const [, params] = useRoute("/grants/:id");
  const id = parseInt(params?.id || "0");
  const { data: grant, isLoading } = useGrant(id);
  const updateStatus = useUpdateMatchStatus();

  if (isLoading || !grant) {
    return (
      <LayoutShell>
        <div className="space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </LayoutShell>
    );
  }

  const aiAnalysis = (grant.match?.aiAnalysis as unknown) as AiAnalysis | null;
  const isSaved = grant.match?.status === 'saved';
  const isApplied = grant.match?.status === 'applied';

  return (
    <LayoutShell>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Navigation */}
        <Link href="/grants">
          <div className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-primary mb-4 cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Ayudas
          </div>
        </Link>

        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8">
            <div className="flex-shrink-0">
              <MatchScoreBadge score={grant.match?.score || 0} size="lg" />
            </div>

            <div className="flex-1 min-w-0 space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                  <Badge variant="outline">{grant.scope}</Badge>
                  <span>•</span>
                  <span>{grant.organismo}</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-display font-bold text-slate-900 leading-tight">
                  {grant.title}
                </h1>
              </div>

              <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100">
                <div className="flex items-center text-slate-700">
                  <Wallet className="mr-2 h-5 w-5 text-emerald-500" />
                  <span className="font-semibold">€{grant.budget?.toLocaleString()}</span>
                  <span className="text-slate-400 ml-1 text-sm">Presupuesto Total</span>
                </div>
                <div className="flex items-center text-slate-700">
                  <Calendar className="mr-2 h-5 w-5 text-blue-500" />
                  <span className="font-semibold">
                    {grant.endDate ? new Date(grant.endDate).toLocaleDateString() : 'Abierta'}
                  </span>
                  <span className="text-slate-400 ml-1 text-sm">Fecha Límite</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 md:w-48">
              <Button className="w-full bg-primary hover:bg-blue-700 shadow-lg shadow-blue-500/20">
                Solicitar Ahora <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant={isSaved ? "secondary" : "outline"} 
                  className={cn("w-full", isSaved && "bg-amber-100 text-amber-700 hover:bg-amber-200")}
                  onClick={() => updateStatus.mutate({ id: grant.match!.id, status: isSaved ? 'new' : 'saved' })}
                >
                  <Bookmark className={cn("h-4 w-4 mr-2", isSaved && "fill-current")} />
                  {isSaved ? "Guardada" : "Guardar"}
                </Button>
                <Button 
                  variant={isApplied ? "secondary" : "outline"}
                  className={cn("w-full", isApplied && "bg-emerald-100 text-emerald-700 hover:bg-emerald-200")}
                  onClick={() => updateStatus.mutate({ id: grant.match!.id, status: isApplied ? 'new' : 'applied' })}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isApplied ? "Solicitada" : "Seguimiento"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="ai-summary" className="w-full">
          <TabsList className="bg-white border border-slate-200 p-1 rounded-xl w-full md:w-auto grid grid-cols-3 md:inline-flex h-auto">
            <TabsTrigger value="ai-summary" className="py-2.5 rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              <Sparkles className="h-4 w-4 mr-2" />
              Análisis IA
            </TabsTrigger>
            <TabsTrigger value="details" className="py-2.5 rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              Detalles
            </TabsTrigger>
            <TabsTrigger value="requirements" className="py-2.5 rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              Requisitos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai-summary" className="mt-6 space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Por qué encaja con tu empresa
              </h3>
              <p className="text-slate-600 leading-relaxed mb-8">
                {aiAnalysis?.summary || "Análisis de IA no disponible para esta ayuda todavía."}
              </p>

              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-500" />
                    Gastos Elegibles
                  </h4>
                  <ul className="space-y-3">
                    {aiAnalysis?.expenses?.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                        <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                    {!aiAnalysis?.expenses && <li className="text-slate-400 italic">No se han extraído gastos específicos.</li>}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Requisitos Clave
                  </h4>
                  <ul className="space-y-3">
                    {aiAnalysis?.requirements?.map((item, i) => (
                      <li key={i} className="flex items-start gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                        <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                    {!aiAnalysis?.requirements && <li className="text-slate-400 italic">No se han extraído requisitos específicos.</li>}
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="details">
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm prose prose-slate max-w-none">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Descripción Completa</h3>
              <div className="whitespace-pre-wrap text-slate-600">
                {grant.rawText || "No hay descripción completa disponible."}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="requirements">
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
               <h3 className="text-lg font-bold text-slate-900 mb-4">Criterios de Elegibilidad</h3>
               <p className="text-slate-600">
                 Los requisitos detallados de elegibilidad se extraen de la documentación oficial. 
                 Por favor, verifica todos los criterios en el boletín oficial antes de solicitar.
               </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </LayoutShell>
  );
}
