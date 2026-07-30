import { useRoute } from "wouter";
import { useGrant } from "@/hooks/use-grants";
import { LayoutShell } from "@/components/layout-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatchScoreBadge } from "@/components/match-score-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ExternalLink, CheckCircle, Calendar, AlertCircle, Building, Sparkles } from "lucide-react";
import { Link } from "wouter";

export default function GrantDetailPage() {
  const [, params] = useRoute("/grants/:id");
  const id = parseInt(params?.id || "0");
  const { data: grant, isLoading } = useGrant(id);

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

  const userMatch = grant.match;

  return (
    <LayoutShell>
      <div className="max-w-5xl mx-auto space-y-8">
        <Link href="/grants">
          <div className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-primary mb-4 cursor-pointer">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Ayudas
          </div>
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8">
            <div className="flex-shrink-0">
              <MatchScoreBadge score={userMatch?.score || grant.relevanceScore || 0} size="lg" />
            </div>

            <div className="flex-1 min-w-0 space-y-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
                  <Badge variant="outline" className="bg-slate-50">{grant.source.toUpperCase()}</Badge>
                  {grant.scope && (
                    <>
                      <span>•</span>
                      <span>{grant.scope}</span>
                    </>
                  )}
                  {grant.code && (
                    <>
                      <span>•</span>
                      <span className="font-mono">{grant.code}</span>
                    </>
                  )}
                </div>
                <h1 className="text-2xl md:text-3xl font-display font-bold text-slate-900 leading-tight">
                  {grant.title}
                </h1>
              </div>

              <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-100">
                {grant.publishedAt && (
                  <div className="flex items-center text-slate-700">
                    <Calendar className="mr-2 h-5 w-5 text-blue-500" />
                    <span className="font-semibold">
                      {new Date(grant.publishedAt).toLocaleDateString()}
                    </span>
                    <span className="text-slate-400 ml-1 text-sm">Fecha Publicación</span>
                  </div>
                )}
                {grant.kind && (
                  <div className="flex items-center text-slate-700">
                    <Badge variant="secondary">{grant.kind}</Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 md:w-48">
              {grant.publicUrl ? (
                <a href={grant.publicUrl} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full bg-primary hover:bg-blue-700 shadow-lg shadow-blue-500/20">
                    Ver Original <ExternalLink className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              ) : (
                <Button disabled className="w-full">
                  Sin Enlace <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <Tabs defaultValue="ai-summary" className="w-full">
          <TabsList className="bg-white border border-slate-200 p-1 rounded-xl w-full md:w-auto grid grid-cols-2 md:inline-flex h-auto">
            <TabsTrigger value="ai-summary" className="py-2.5 rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              <Sparkles className="h-4 w-4 mr-2" />
              Análisis OpenClaw
            </TabsTrigger>
            <TabsTrigger value="raw" className="py-2.5 rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              Datos Crudos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai-summary" className="mt-6 space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Por qué esta ayuda es relevante
              </h3>
              
              <div className="grid md:grid-cols-2 gap-8">
                {userMatch && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Encaje con tu Empresa ({userMatch.entitySlug})
                    </h4>
                    {userMatch.fitSummary && (
                      <p className="text-slate-600 mb-4 bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                        {userMatch.fitSummary}
                      </p>
                    )}
                    
                    {userMatch.reasons && Array.isArray(userMatch.reasons) && userMatch.reasons.length > 0 && (
                      <div className="mb-4">
                        <strong className="block text-sm text-slate-700 mb-2">Motivos a favor:</strong>
                        <ul className="space-y-2">
                          {(userMatch.reasons as string[]).map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                              {String(r)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {userMatch.blockers && Array.isArray(userMatch.blockers) && userMatch.blockers.length > 0 && (
                      <div>
                        <strong className="block text-sm text-slate-700 mb-2">Posibles frenos:</strong>
                        <ul className="space-y-2">
                          {(userMatch.blockers as string[]).map((b, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                              {String(b)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                
                <div>
                  <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Building className="h-4 w-4 text-blue-500" />
                    Motivos Generales de la Ayuda
                  </h4>
                  {grant.relevanceReasons && Array.isArray(grant.relevanceReasons) && grant.relevanceReasons.length > 0 ? (
                    <ul className="space-y-3">
                      {(grant.relevanceReasons as string[]).map((item, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                          <div className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                          {String(item)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-sm italic">OpenClaw no proporcionó motivos generales adicionales.</p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="raw">
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm prose prose-slate max-w-none">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Payload de OpenClaw</h3>
              <pre className="bg-slate-900 text-slate-50 p-4 rounded-xl overflow-auto text-sm">
                {JSON.stringify(grant.rawPayload, null, 2)}
              </pre>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </LayoutShell>
  );
}
