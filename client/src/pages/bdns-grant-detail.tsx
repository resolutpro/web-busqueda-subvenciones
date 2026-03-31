import { useRoute } from "wouter";
import { useBdnsGrant, useDeleteBdnsGrant } from "@/hooks/use-bdns-grants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, ArrowLeft, ExternalLink, CheckCircle, XCircle, Building } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function BdnsGrantDetail() {
  const [, params] = useRoute("/bdns-grants/:id");
  const { data: grant, isLoading } = useBdnsGrant(params?.id || "");
  const deleteMutation = useDeleteBdnsGrant();

  if (isLoading) return <div className="p-8 flex justify-center mt-10">Cargando detalles de la subvención...</div>;
  if (!grant) return <div className="p-8 text-center text-muted-foreground mt-10">Subvención no encontrada.</div>;

  const handleDiscard = () => {
    if (confirm("¿Estás seguro de que quieres descartar esta subvención? Desaparecerá de tus guardados.")) {
      deleteMutation.mutate(grant.id, {
        onSuccess: () => {
          // Vuelve atrás una vez borrado
          window.history.back(); 
        }
      });
    }
  };

  // Formatear las claves del JSON extraído
  const formatKey = (key: string) => {
    const formatters: Record<string, string> = {
      presupuestoTotal: "Presupuesto Total",
      sedeElectronica: "Sede Electrónica",
      tipoConvocatoria: "Tipo de Convocatoria",
      tipoBeneficiario: "Tipo de Beneficiario",
      sectorEconomico: "Sector Económico",
      finPolitica: "Finalidad",
      tituloBases: "Bases Reguladoras",
      regionImpacto: "Región de Impacto"
    };
    return formatters[key] || key;
  };

  // Filtramos para quedarnos ÚNICAMENTE con las empresas donde cuadra === true
  const matches = (grant.iaAnalisis?.matches || []).filter((m: any) => m.cuadra);
  const hasMatches = matches.length > 0;

  return (
    <div className="container max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <Button variant="ghost" onClick={() => window.history.back()} className="hover:bg-slate-200">
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver a Oportunidades
        </Button>
        <div className="flex gap-2 w-full sm:w-auto">
          {grant.urlDetalle && (
            <a href={grant.urlDetalle} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none">
              <Button className="w-full bg-blue-600 hover:bg-blue-700">
                Ver Oficial <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </a>
          )}
          <Button variant="destructive" onClick={handleDiscard} disabled={deleteMutation.isPending} className="flex-1 sm:flex-none">
            <Trash2 className="mr-2 h-4 w-4" /> Descartar
          </Button>
        </div>
      </div>

      <Card className="shadow-lg border-slate-200">
        <CardHeader className="bg-slate-50 border-b pb-6">
          <div className="flex items-center gap-3 mb-3">
            <Badge className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1">
              BDNS: {grant.codigoBDNS}
            </Badge>
          </div>
          <CardTitle className="text-2xl md:text-3xl leading-tight text-slate-900">{grant.titulo}</CardTitle>
          <p className="text-lg text-slate-600 mt-2 font-medium flex items-center gap-2">
            <Building className="h-5 w-5 text-slate-400" />
            {grant.organoConvocante}
          </p>
        </CardHeader>

        <CardContent className="space-y-10 pt-8">

          {/* SECCIÓN 1: Análisis de la IA Multi-Empresa */}
          <section>
            <h3 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2 border-b pb-2">
              🤖 Análisis de Compatibilidad (IA)
            </h3>

            {hasMatches ? (
              <div className="grid gap-4 md:grid-cols-2">
                {matches.map((match: any, idx: number) => (
                  <div key={idx} className={`p-5 rounded-xl border-2 transition-all ${match.cuadra ? 'bg-green-50/50 border-green-200 hover:border-green-300' : 'bg-slate-50/50 border-slate-200 opacity-75'}`}>
                    <div className="flex items-start gap-3 mb-3">
                      {match.cuadra ? (
                        <CheckCircle className="text-green-600 h-6 w-6 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="text-slate-400 h-6 w-6 flex-shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className="font-bold text-slate-900 flex flex-wrap items-center gap-2">
                          {match.companyName || `Empresa ID: ${match.companyId}`}
                          {match.cuadra && (
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-none">
                              Aceptada
                            </Badge>
                          )}
                        </h4>
                      </div>
                    </div>
                    <p className={`text-sm leading-relaxed whitespace-pre-wrap ${match.cuadra ? 'text-green-900' : 'text-slate-600'}`}>
                      {match.razon}
                    </p>
                  </div>
                ))}
              </div>
            ) : grant.iaAnalisis?.razon ? (
              /* Fallback por si la subvención se guardó con el sistema antiguo */
              <div className="bg-blue-50 border border-blue-200 p-5 rounded-xl flex gap-4 items-start">
                <CheckCircle className="text-blue-600 h-6 w-6 mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-blue-900 mb-1">Evaluación General:</h3>
                  <p className="text-blue-800 leading-relaxed whitespace-pre-wrap">{grant.iaAnalisis.razon}</p>
                </div>
              </div>
            ) : (
               <p className="text-slate-500 italic">No hay datos de IA disponibles para esta subvención.</p>
            )}
          </section>

          {/* SECCIÓN 2: Detalles extraídos (Datos técnicos) */}
          {grant.detallesExtraidos && Object.keys(grant.detallesExtraidos).length > 0 && (
            <section>
              <h3 className="text-xl font-bold text-slate-900 mb-4 border-b pb-2">📋 Datos Técnicos de la Convocatoria</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 bg-slate-50 p-6 rounded-xl border border-slate-200">
                {Object.entries(grant.detallesExtraidos).map(([key, value]) => {
                  if (!value || value === "") return null; 

                  return (
                    <div key={key} className="space-y-1">
                      <dt className="text-xs font-bold text-slate-500 uppercase tracking-wider">{formatKey(key)}</dt>
                      <dd className="text-sm text-slate-900 font-medium break-words bg-white p-3 rounded border border-slate-100 shadow-sm">
                        {String(value)}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </section>
          )}

        </CardContent>
      </Card>
    </div>
  );
}