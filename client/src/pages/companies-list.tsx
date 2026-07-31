import { LayoutShell } from "@/components/layout-shell";
import { useAllCompanies } from "@/hooks/use-companies";
import { Skeleton } from "@/components/ui/skeleton";
import { Building, MapPin, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export default function CompaniesListPage() {
  const { data: companies, isLoading } = useAllCompanies();

  return (
    <LayoutShell>
      <div className="container mx-auto p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">
              Directorio de Empresas
            </h1>
            <p className="text-slate-500 mt-1">
              Empresas registradas en el sistema e importadas desde OpenClaw
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array(6)
              .fill(0)
              .map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-4">
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-20 w-full mt-2" />
                </div>
              ))
          ) : companies?.length === 0 ? (
            <div className="col-span-full text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
              <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">
                No hay empresas registradas
              </h3>
              <p className="text-slate-500">
                Aún no se ha importado ninguna empresa desde OpenClaw.
              </p>
            </div>
          ) : (
            companies?.map((company) => (
              <Dialog key={company.id}>
                <DialogTrigger asChild>
                  <div
                    className="group bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all flex flex-col cursor-pointer text-left"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                          {company.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600">
                            {company.slug}
                          </Badge>
                          {company.size && (
                            <Badge className="text-xs bg-blue-50 text-blue-700 border-none">
                              {company.size.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex-1">
                      <p className="text-sm text-slate-600 line-clamp-3 mb-4">
                        {company.description}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 pt-4 border-t border-slate-50 mt-auto text-sm text-slate-500">
                      {company.cnae && (
                        <div className="flex items-center">
                          <Building className="mr-2 h-4 w-4 text-slate-400" />
                          CNAE: {company.cnae}
                        </div>
                      )}
                      {company.location && (
                        <div className="flex items-center">
                          <MapPin className="mr-2 h-4 w-4 text-slate-400" />
                          {company.location}
                        </div>
                      )}
                    </div>
                  </div>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-2xl font-bold">{company.name}</DialogTitle>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="bg-slate-50">{company.slug}</Badge>
                      {company.size && <Badge className="bg-blue-50 text-blue-700 border-none">{company.size.toUpperCase()}</Badge>}
                    </div>
                  </DialogHeader>
                  
                  <div className="mt-4 space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-900 mb-2">Descripción General</h4>
                      <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                        {company.description}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                      {company.cnae && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 mb-1">CNAE / Sector</h4>
                          <div className="flex items-center text-sm text-slate-600">
                            <Building className="mr-2 h-4 w-4 text-slate-400" />
                            {company.cnae}
                          </div>
                        </div>
                      )}
                      {company.location && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 mb-1">Ubicación</h4>
                          <div className="flex items-center text-sm text-slate-600">
                            <MapPin className="mr-2 h-4 w-4 text-slate-400" />
                            {company.location}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ))
          )}
        </div>
      </div>
    </LayoutShell>
  );
}
