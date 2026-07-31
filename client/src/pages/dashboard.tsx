import { LayoutShell } from "@/components/layout-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Loader2, ShieldCheck, Flag, Building2, Activity, Calendar, Clock } from "lucide-react";
import { useScanStatus } from "@/hooks/use-grants";

export default function Dashboard() {
  const { data: status, isLoading } = useScanStatus();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Desconocido";
    try {
      return format(new Date(dateStr), "dd MMM yyyy", { locale: es });
    } catch (e) {
      return dateStr;
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "Desconocido";
    try {
      return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: es });
    } catch (e) {
      return dateStr;
    }
  };

  const formatRelative = (dateStr: string | null) => {
    if (!dateStr) return "";
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: es });
    } catch (e) {
      return "";
    }
  };

  return (
    <LayoutShell>
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-8 border-b pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold text-slate-900">Estado de Actualización</h1>
              <p className="text-slate-500 mt-2">Monitoreo en tiempo real de las fuentes de subvenciones por el agente OpenClaw.</p>
            </div>
            {status?.lastRunAt && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center space-x-4">
                <div className="bg-blue-100 p-2 rounded-full">
                  <Activity className="h-6 w-6 text-blue-600 animate-pulse" />
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900">Última ejecución global</p>
                  <p className="text-xl font-bold text-blue-700">{formatDateTime(status.lastRunAt)}</p>
                  <p className="text-xs text-blue-500 font-medium capitalize">{formatRelative(status.lastRunAt)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-64 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-slate-500">Cargando estado...</p>
          </div>
        ) : !status ? (
           <div className="text-center py-12">
             <p className="text-slate-500">Aún no hay datos de escaneo disponibles.</p>
           </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* BOE */}
            <Card className="hover:shadow-lg transition-all border-slate-200 flex flex-col overflow-hidden">
              <div className="h-2 bg-red-600 w-full" />
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-red-50 rounded-lg">
                    <ShieldCheck className="h-6 w-6 text-red-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-800">BOE</CardTitle>
                    <CardDescription>Boletín Oficial del Estado</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-2">
                <div>
                  <p className="text-sm font-medium text-slate-500 flex items-center mb-1">
                    <Calendar className="h-4 w-4 mr-2" /> 
                    Última publicación revisada
                  </p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatDate(status.sources?.boe?.lastPublishedDateSeen)}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-sm font-medium text-slate-500 flex items-center mb-1">
                    <Clock className="h-4 w-4 mr-2" /> 
                    Última comprobación
                  </p>
                  <p className="text-md font-semibold text-slate-700">
                    {formatDateTime(status.sources?.boe?.lastCheckedAt)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* BDNS */}
            <Card className="hover:shadow-lg transition-all border-slate-200 flex flex-col overflow-hidden">
              <div className="h-2 bg-amber-500 w-full" />
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Building2 className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-800">BDNS</CardTitle>
                    <CardDescription>Base Datos Nac. Subvenciones</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-2">
                <div>
                  <p className="text-sm font-medium text-slate-500 flex items-center mb-1">
                    <Calendar className="h-4 w-4 mr-2" /> 
                    Última publicación revisada
                  </p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatDate(status.sources?.bdns?.lastPublishedDateSeen)}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-sm font-medium text-slate-500 flex items-center mb-1">
                    <Clock className="h-4 w-4 mr-2" /> 
                    Última comprobación
                  </p>
                  <p className="text-md font-semibold text-slate-700">
                    {formatDateTime(status.sources?.bdns?.lastCheckedAt)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* EU Funding */}
            <Card className="hover:shadow-lg transition-all border-slate-200 flex flex-col overflow-hidden">
              <div className="h-2 bg-blue-600 w-full" />
              <CardHeader className="pb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Flag className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-800">EU Funding</CardTitle>
                    <CardDescription>Fondos Europeos</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 pt-2">
                <div>
                  <p className="text-sm font-medium text-slate-500 flex items-center mb-1">
                    <Calendar className="h-4 w-4 mr-2" /> 
                    Última publicación revisada
                  </p>
                  <p className="text-lg font-bold text-slate-900">
                    {formatDate(status.sources?.euFunding?.lastPublishedDateSeen)}
                  </p>
                </div>
                <div className="pt-4 border-t border-slate-100">
                  <p className="text-sm font-medium text-slate-500 flex items-center mb-1">
                    <Clock className="h-4 w-4 mr-2" /> 
                    Última comprobación
                  </p>
                  <p className="text-md font-semibold text-slate-700">
                    {formatDateTime(status.sources?.euFunding?.lastCheckedAt)}
                  </p>
                </div>
              </CardContent>
            </Card>

          </div>
        )}
      </div>
    </LayoutShell>
  );
}