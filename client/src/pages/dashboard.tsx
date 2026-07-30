import { LayoutShell } from "@/components/layout-shell";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Landmark, ArrowRight, Loader2, Sparkles, RefreshCw } from "lucide-react";

export default function Dashboard() {
  const { data: grants, isLoading } = useQuery<any[]>({ queryKey: ["/api/grants"] });

  const totalGrants = grants?.length || 0;
  const newGrants = grants?.filter((g: any) => g.isNew)?.length || 0;
  const updatedGrants = grants?.filter((g: any) => g.isUpdated)?.length || 0;

  return (
    <LayoutShell>
      <div className="container mx-auto p-6 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-display font-bold text-slate-900">Panel de Control (OpenClaw)</h1>
          <p className="text-slate-500 mt-2">Subvenciones recibidas desde el agente inteligente.</p>
        </div>

        {isLoading ? (
          <div className="flex flex-col justify-center items-center h-64 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-slate-500">Cargando datos...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            <Card className="hover:shadow-lg transition-all border-blue-100 flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-lg font-bold text-slate-800">Total Recibidas</CardTitle>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Landmark className="h-5 w-5 text-blue-600" />
                </div>
              </CardHeader>
              <CardContent className="flex-1 mt-4">
                <div className="text-5xl font-black text-slate-900 mb-2">
                  {totalGrants}
                </div>
                <p className="text-sm font-medium text-slate-500">Subvenciones en total</p>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t pt-4 mt-4">
                <Link href="/grants" className="w-full">
                  <Button 
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white" 
                  >
                    Ver Todas <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            <Card className="hover:shadow-lg transition-all border-green-100 flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-lg font-bold text-slate-800">Nuevas</CardTitle>
                <div className="p-2 bg-green-100 rounded-lg">
                  <Sparkles className="h-5 w-5 text-green-600" />
                </div>
              </CardHeader>
              <CardContent className="flex-1 mt-4">
                <div className="text-5xl font-black text-slate-900 mb-2">
                  {newGrants}
                </div>
                <p className="text-sm font-medium text-slate-500">Pendientes de revisión</p>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t pt-4 mt-4">
                <Link href="/grants?status=new" className="w-full">
                  <Button 
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    variant={newGrants === 0 ? "outline" : "default"}
                  >
                    Revisar Nuevas <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            <Card className="hover:shadow-lg transition-all border-amber-100 flex flex-col">
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-lg font-bold text-slate-800">Actualizadas</CardTitle>
                <div className="p-2 bg-amber-100 rounded-lg">
                  <RefreshCw className="h-5 w-5 text-amber-600" />
                </div>
              </CardHeader>
              <CardContent className="flex-1 mt-4">
                <div className="text-5xl font-black text-slate-900 mb-2">
                  {updatedGrants}
                </div>
                <p className="text-sm font-medium text-slate-500">Han sufrido cambios</p>
              </CardContent>
              <CardFooter className="bg-slate-50 border-t pt-4 mt-4">
                <Link href="/grants?status=updated" className="w-full">
                  <Button 
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    variant={updatedGrants === 0 ? "outline" : "default"}
                  >
                    Ver Actualizadas <ArrowRight className="ml-2 h-4 w-4" />
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