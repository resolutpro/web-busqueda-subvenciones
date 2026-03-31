import { LayoutShell } from "@/components/layout-shell";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { BookOpen, Globe, Landmark, ArrowRight, Loader2 } from "lucide-react";

export default function Dashboard() {
  // Obtenemos los datos de las tres fuentes
  const { data: bdnsGrants, isLoading: isLoadingBdns } = useQuery({ queryKey: ["/api/bdns-grants"] });
  const { data: boeGrants, isLoading: isLoadingBoe } = useQuery({ queryKey: ["/api/boe-grants"] });
  const { data: tedGrants, isLoading: isLoadingTed } = useQuery({ queryKey: ["/api/ted-grants"] });

  // Calculamos cuántas están pendientes en cada una
  const pendingBdns = bdnsGrants?.filter((g: any) => g.status === "pending" || !g.status)?.length || 0;
  const pendingBoe = boeGrants?.filter((g: any) => g.status === "pending" || !g.status)?.length || 0;
  const pendingTed = tedGrants?.filter((g: any) => g.status === "pending" || !g.status)?.length || 0;

  const isLoading = isLoadingBdns || isLoadingBoe || isLoadingTed;

  return (
    <LayoutShell>
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-slate-900">Panel de Control</h1>
          <p className="text-slate-500 mt-2">Resumen de oportunidades pendientes de revisión de todas las fuentes.</p>
        </div>

        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-64 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-slate-500">Cargando estado de las subvenciones...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Tarjeta BDNS */}
            <Card className="hover:shadow-lg transition-all border-blue-100 flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-lg font-bold text-slate-800">Base Nacional (BDNS)</CardTitle>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Landmark className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent className="flex-1 mt-4">
                <div className="text-5xl font-black text-slate-900 mb-2">
                  {pendingBdns}
                </div>
                <p className="text-sm font-medium text-slate-500">Subvenciones pendientes</p>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t pt-4 mt-4">
                <Link href="/bdns" className="w-full">
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white" 
                    variant={pendingBdns === 0 ? "outline" : "default"}
                  >
                    {pendingBdns > 0 ? "Revisar BDNS" : "Ir a BDNS"} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Tarjeta BOE */}
            <Card className="hover:shadow-lg transition-all border-slate-200 flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-lg font-bold text-slate-800">Boletín Oficial (BOE)</CardTitle>
                <div className="p-2 bg-slate-100 rounded-lg">
                  <BookOpen className="h-5 w-5 text-slate-700" />
                </div>
              </CardHeader>
              <CardContent className="flex-1 mt-4">
                <div className="text-5xl font-black text-slate-900 mb-2">
                  {pendingBoe}
                </div>
                <p className="text-sm font-medium text-slate-500">Anuncios pendientes</p>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t pt-4 mt-4">
                <Link href="/boe" className="w-full">
                  <Button 
                    className="w-full bg-slate-800 hover:bg-slate-900 text-white"
                    variant={pendingBoe === 0 ? "outline" : "default"}
                  >
                    {pendingBoe > 0 ? "Revisar BOE" : "Ir al BOE"} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            {/* Tarjeta Europa */}
            <Card className="hover:shadow-lg transition-all border-purple-100 flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-lg font-bold text-slate-800">Europa (F&T)</CardTitle>
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Globe className="h-5 w-5 text-purple-600" />
                </div>
              </CardHeader>
              <CardContent className="flex-1 mt-4">
                <div className="text-5xl font-black text-slate-900 mb-2">
                  {pendingTed}
                </div>
                <p className="text-sm font-medium text-slate-500">Convocatorias pendientes</p>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t pt-4 mt-4">
                <Link href="/europa" className="w-full">
                  <Button 
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                    variant={pendingTed === 0 ? "outline" : "default"}
                  >
                    {pendingTed > 0 ? "Revisar Europa" : "Ir a Europa"} <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

          </div>
        )}
      </div>
    </LayoutShell>
  );
}