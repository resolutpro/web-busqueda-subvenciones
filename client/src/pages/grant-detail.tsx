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
  const rawPayload = grant.rawPayload as any;
  
  let proposal = userMatch?.proposal || rawPayload?.proposal || rawPayload?.match?.proposal || rawPayload?.primaryMatch?.proposal;
  
  if (!proposal && (rawPayload?.projectIdea || rawPayload?.proposalTitle || rawPayload?.proposalShortSummary || rawPayload?.proposalActions)) {
    proposal = {
      title: rawPayload.proposalTitle || "Propuesta de Proyecto",
      shortSummary: rawPayload.proposalShortSummary,
      projectIdea: rawPayload.projectIdea,
      fitReasoning: rawPayload.proposalFitReasoning,
      estimatedCosts: rawPayload.proposalEstimatedCosts,
      actions: rawPayload.proposalActions,
      nextSteps: rawPayload.proposalNextSteps,
      risksQuestions: rawPayload.proposalRisksQuestions,
    };
  } else if (proposal && rawPayload?.projectIdea && !proposal.projectIdea) {
    proposal = { ...proposal, projectIdea: rawPayload.projectIdea };
  }
  
  // Ensure proposal has keys to show
  if (proposal && !Object.values(proposal).some(v => v)) {
    proposal = null;
  }

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
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-2 flex-wrap">
                  <Badge variant="outline" className="bg-slate-50">{grant.source.toUpperCase()}</Badge>
                  {grant.organism && (
                    <>
                      <span className="hidden sm:inline">•</span>
                      <span className="font-medium text-slate-700">{grant.organism}</span>
                    </>
                  )}
                  {grant.scope && (
                    <>
                      <span className="hidden sm:inline">•</span>
                      <span>{grant.scope}</span>
                    </>
                  )}
                  {grant.code && (
                    <>
                      <span className="hidden sm:inline">•</span>
                      <span className="font-mono bg-slate-100 px-1 rounded">{grant.code}</span>
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
                    <span className="text-slate-400 ml-1 text-sm">Publicación</span>
                  </div>
                )}
                {grant.kind && (
                  <div className="flex items-center text-slate-700">
                    <Badge variant="secondary">{grant.kind}</Badge>
                  </div>
                )}
                {grant.maxIntensity && (
                  <div className="flex items-center text-slate-700">
                    <Badge className="bg-emerald-100 text-emerald-800 border-none">
                      Intensidad: {grant.maxIntensity}
                    </Badge>
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

        <Tabs defaultValue={proposal ? "proposal" : "ai-summary"} className="w-full">
          <TabsList className="bg-white border border-slate-200 p-1 rounded-xl w-full md:w-auto grid grid-cols-2 md:inline-flex h-auto">
            {proposal && (
              <TabsTrigger value="proposal" className="py-2.5 rounded-lg data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700">
                <Sparkles className="h-4 w-4 mr-2" />
                Propuesta de Proyecto
              </TabsTrigger>
            )}
            <TabsTrigger value="ai-summary" className="py-2.5 rounded-lg data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
              <CheckCircle className="h-4 w-4 mr-2" />
              Análisis de Encaje
            </TabsTrigger>
            <TabsTrigger value="details" className="py-2.5 rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900">
              Detalles de Convocatoria
            </TabsTrigger>
          </TabsList>

          {proposal && (
            <TabsContent value="proposal" className="mt-6 space-y-6">
              <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm border-t-4 border-t-purple-500">
                <div className="mb-6">
                  <Badge className="mb-3 bg-purple-100 text-purple-800 border-none">Estrategia OpenClaw</Badge>
                  <h3 className="text-2xl font-bold text-slate-900">{proposal.title}</h3>
                  {proposal.shortSummary && (
                    <p className="text-lg text-slate-600 mt-2">{proposal.shortSummary}</p>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    {proposal.problemOpportunity && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-purple-500" /> Oportunidad / Problema
                        </h4>
                        <p className="text-slate-600 bg-slate-50 p-4 rounded-lg">{proposal.problemOpportunity}</p>
                      </div>
                    )}
                    {proposal.projectIdea && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-purple-500" /> Idea de Proyecto
                        </h4>
                        <p className="text-slate-600 bg-slate-50 p-4 rounded-lg">{proposal.projectIdea}</p>
                      </div>
                    )}
                    {proposal.estimatedCosts && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                          <Building className="h-4 w-4 text-purple-500" /> Costes Estimados
                        </h4>
                        <p className="text-slate-600 bg-slate-50 p-4 rounded-lg font-mono">{proposal.estimatedCosts}</p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    {Array.isArray(proposal.actions) && proposal.actions.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-purple-500" /> Actuaciones Clave
                        </h4>
                        <ul className="space-y-2 bg-slate-50 p-4 rounded-lg">
                          {(proposal.actions as string[]).map((action, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                              <span className="text-purple-500 font-bold mr-1">•</span> {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(proposal.risksQuestions) && proposal.risksQuestions.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-amber-500" /> Riesgos y Dudas a Validar
                        </h4>
                        <ul className="space-y-2 bg-amber-50 p-4 rounded-lg border border-amber-100">
                          {(proposal.risksQuestions as string[]).map((risk, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                              <span className="text-amber-500 font-bold mr-1">•</span> {risk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(proposal.nextSteps) && proposal.nextSteps.length > 0 && (
                      <div>
                        <h4 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                          <ExternalLink className="h-4 w-4 text-emerald-500" /> Siguientes Pasos
                        </h4>
                        <ul className="space-y-2 bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                          {(proposal.nextSteps as string[]).map((step, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-emerald-900">
                              <span className="text-emerald-500 font-bold mr-1">{i+1}.</span> {step}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>
          )}

          <TabsContent value="ai-summary" className="mt-6 space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-blue-600" />
                Análisis de Encaje de OpenClaw
              </h3>
              
              <div className="grid md:grid-cols-2 gap-8">
                {rawPayload?.llmSummary && (
                  <div className="md:col-span-2 p-4 bg-blue-50 border border-blue-100 rounded-lg text-slate-800">
                    <strong className="block mb-1 text-blue-900">Resumen Global LLM:</strong>
                    <p>{rawPayload.llmSummary}</p>
                  </div>
                )}
                
                {rawPayload?.publishRecommendation && (
                  <div className="md:col-span-2 p-4 bg-purple-50 border border-purple-100 rounded-lg text-slate-800">
                    <strong className="block mb-1 text-purple-900">Recomendación de Publicación:</strong>
                    <p>{rawPayload.publishRecommendation}</p>
                  </div>
                )}
                
                {Array.isArray(rawPayload?.globalBlockers) && rawPayload.globalBlockers.length > 0 && (
                  <div className="md:col-span-2 p-4 bg-amber-50 border border-amber-100 rounded-lg text-slate-800">
                    <strong className="block mb-2 flex items-center gap-2 text-amber-900">
                      <AlertCircle className="h-4 w-4" /> Blockers Globales:
                    </strong>
                    <ul className="list-disc pl-5 space-y-1">
                      {rawPayload.globalBlockers.map((b: string, i: number) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}

                {userMatch && (
                  <div>
                    <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <Building className="h-4 w-4 text-emerald-500" />
                      Encaje con la Empresa ({userMatch.entitySlug})
                    </h4>
                    {userMatch.fitSummary && (
                      <p className="text-slate-600 mb-4 bg-emerald-50 p-4 rounded-lg border border-emerald-100">
                        {userMatch.fitSummary}
                      </p>
                    )}
                    
                    {Array.isArray(userMatch.reasons) && userMatch.reasons.length > 0 && (
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
                    
                    {Array.isArray(userMatch.blockers) && userMatch.blockers.length > 0 && (
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
                    <Sparkles className="h-4 w-4 text-blue-500" />
                    Motivos Generales de la Ayuda
                  </h4>
                  {Array.isArray(grant.relevanceReasons) && grant.relevanceReasons.length > 0 ? (
                    <ul className="space-y-3">
                      {(grant.relevanceReasons as string[]).map((item, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">
                          <div className="h-1.5 w-1.5 rounded-full bg-blue-400 mt-2 flex-shrink-0" />
                          {String(item)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 text-sm italic">No hay motivos generales adicionales.</p>
                  )}
                </div>
              </div>

              {rawPayload?.matches && Array.isArray(rawPayload.matches) && rawPayload.matches.length > 0 && (
                <div className="mt-8 pt-8 border-t border-slate-100">
                   <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                     <Building className="h-4 w-4 text-slate-500" /> Otras empresas candidatas
                   </h4>
                   <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                     {rawPayload.matches.map((m: any, i: number) => (
                       <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                         <div className="flex justify-between items-start mb-2">
                           <span className="font-bold text-slate-800">{m.matchedEntityName || m.entitySlug}</span>
                           <Badge variant="outline" className={m.score > 70 ? "text-emerald-700 bg-emerald-50" : ""}>{m.score}/100</Badge>
                         </div>
                         <p className="text-sm text-slate-600 line-clamp-3">{m.fitSummary || m.label}</p>
                       </div>
                     ))}
                   </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="details" className="mt-6 space-y-6">
            <div className="bg-white p-6 md:p-8 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Datos Oficiales de la Convocatoria</h3>
              
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-6">
                {grant.beneficiaryType && (
                  <div>
                    <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Tipo de Beneficiario</span>
                    <p className="text-slate-800">{grant.beneficiaryType}</p>
                  </div>
                )}
                {grant.executionPeriod && (
                  <div>
                    <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Periodo de Ejecución</span>
                    <p className="text-slate-800">{grant.executionPeriod}</p>
                  </div>
                )}
                {Array.isArray(grant.eligibleSectors) && grant.eligibleSectors.length > 0 && (
                  <div className="md:col-span-2">
                    <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sectores Elegibles</span>
                    <div className="flex flex-wrap gap-2">
                      {(grant.eligibleSectors as string[]).map((sector, i) => (
                        <Badge key={i} variant="secondary" className="bg-slate-100 text-slate-700">{sector}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(grant.eligibleExpenses) && grant.eligibleExpenses.length > 0 && (
                  <div className="md:col-span-2">
                    <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Gastos Subvencionables</span>
                    <ul className="grid sm:grid-cols-2 gap-2">
                      {(grant.eligibleExpenses as any[]).map((exp, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-slate-700 bg-slate-50 p-2 rounded">
                          <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                          {typeof exp === 'string' ? exp : JSON.stringify(exp)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {rawPayload?.grantDetails?.budget && (
                  <div>
                    <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Presupuesto</span>
                    <p className="text-slate-800 font-mono font-medium">{rawPayload.grantDetails.budget}</p>
                  </div>
                )}
                {grant.importantNotes && (
                  <div className="md:col-span-2 bg-amber-50 p-4 rounded-xl border border-amber-100 mt-4">
                    <span className="block text-xs font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" /> Notas Importantes
                    </span>
                    <ul className="space-y-2">
                      {grant.importantNotes.split('\n').filter((n: string) => n.trim()).map((note: string, i: number) => (
                        <li key={i} className="text-amber-900 text-sm flex items-start gap-2">
                          <span className="text-amber-500 mt-0.5 font-bold">•</span>
                          <span>{note.trim()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {rawPayload?.grantDetails?.sourceDetails && typeof rawPayload.grantDetails.sourceDetails === 'object' && (
                  <div className="md:col-span-2 mt-6 space-y-6">
                    <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Resumen de la convocatoria</h3>
                    {rawPayload.grantDetails.sourceDetails.pageSummary && (
                      <div className="bg-slate-50 p-4 rounded-lg text-slate-700 text-sm border border-slate-100 whitespace-pre-wrap">
                        {rawPayload.grantDetails.sourceDetails.pageSummary}
                      </div>
                    )}
                    <div className="grid sm:grid-cols-2 gap-6">
                      {rawPayload.grantDetails.sourceDetails.object && (
                        <div>
                          <strong className="block text-xs text-slate-500 uppercase mb-1">Objeto</strong>
                          <p className="text-sm text-slate-800">{rawPayload.grantDetails.sourceDetails.object}</p>
                        </div>
                      )}
                      {rawPayload.grantDetails.sourceDetails.beneficiaries && (
                        <div>
                          <strong className="block text-xs text-slate-500 uppercase mb-1">Beneficiarios</strong>
                          <p className="text-sm text-slate-800">{rawPayload.grantDetails.sourceDetails.beneficiaries}</p>
                        </div>
                      )}
                      {rawPayload.grantDetails.sourceDetails.amount && (
                        <div>
                          <strong className="block text-xs text-slate-500 uppercase mb-1">Importe</strong>
                          <p className="text-sm text-slate-800">{rawPayload.grantDetails.sourceDetails.amount}</p>
                        </div>
                      )}
                      {rawPayload.grantDetails.sourceDetails.deadline && (
                        <div>
                          <strong className="block text-xs text-slate-500 uppercase mb-1">Plazo</strong>
                          <p className="text-sm text-slate-800">{rawPayload.grantDetails.sourceDetails.deadline}</p>
                        </div>
                      )}
                      {rawPayload.grantDetails.sourceDetails.bases && (
                        <div>
                          <strong className="block text-xs text-slate-500 uppercase mb-1">Bases</strong>
                          <a href={rawPayload.grantDetails.sourceDetails.bases} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                            Ver bases <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                      {rawPayload.grantDetails.sourceDetails.sourceUrl && (
                        <div>
                          <strong className="block text-xs text-slate-500 uppercase mb-1">URL Oficial</strong>
                          <a href={rawPayload.grantDetails.sourceDetails.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                            Abrir enlace <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {rawPayload?.grantDetails?.sourceDetails && typeof rawPayload.grantDetails.sourceDetails === 'string' && (
                  <div className="md:col-span-2 mt-6 space-y-4">
                    <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-2">Resumen de la convocatoria</h3>
                    <div className="bg-slate-50 p-4 rounded-lg text-slate-700 text-sm border border-slate-100 whitespace-pre-wrap">
                      {rawPayload.grantDetails.sourceDetails}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </LayoutShell>
  );
}
