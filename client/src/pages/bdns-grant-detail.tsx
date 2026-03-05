import { useRoute, useLocation } from "wouter";
import { useBdnsGrant, useDeleteBdnsGrant } from "@/hooks/use-bdns-grants";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, ArrowLeft, ExternalLink, CheckCircle } from "lucide-react";

export default function BdnsGrantDetail() {
  const [, params] = useRoute("/bdns-grants/:id");
  const [, setLocation] = useLocation();
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

  // Formatear las claves del JSON extraído para que se vean bonitas
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

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => window.history.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
        <Button variant="destructive" onClick={handleDiscard} disabled={deleteMutation.isPending}>
          <Trash2 className="mr-2 h-4 w-4" /> Descartar (No me sirve)
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardHeader className="bg-slate-50 border-b">
          <div className="flex items-center gap-3 mb-2">
            <span className="bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded">BDNS: {grant.codigoBDNS}</span>
          </div>
          <CardTitle className="text-2xl leading-tight">{grant.titulo}</CardTitle>
          <p className="text-lg text-muted-foreground mt-2 font-medium">{grant.organoConvocante}</p>
        </CardHeader>

        <CardContent className="space-y-8 pt-6">
          {/* Análisis de la IA */}
          {grant.iaAnalisis && grant.iaAnalisis.cuadra && (
            <div className="bg-green-50 border border-green-200 p-5 rounded-lg flex gap-4 items-start">
              <CheckCircle className="text-green-600 h-6 w-6 mt-1 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-green-900 mb-1">Por qué la IA cree que te sirve:</h3>
                <p className="text-green-800 leading-relaxed">{grant.iaAnalisis.razon}</p>
              </div>
            </div>
          )}

          {/* Enlaces y Acciones */}
          {grant.urlDetalle && (
            <div className="flex gap-4">
              <a href={grant.urlDetalle} target="_blank" rel="noreferrer" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700">
                  Ver Convocatoria Original Oficial <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          )}

          {/* Detalles completos scrapeados */}
          {grant.detallesExtraidos && Object.keys(grant.detallesExtraidos).length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-4 border-b pb-2">Datos extraídos de la convocatoria</h3>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6 bg-slate-50 p-6 rounded-lg border">
                {Object.entries(grant.detallesExtraidos).map(([key, value]) => {
                  if (!value || value === "") return null; // Ignoramos campos vacíos

                  return (
                    <div key={key} className="space-y-1">
                      <dt className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{formatKey(key)}</dt>
                      <dd className="text-base text-slate-900 break-words">{String(value)}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}