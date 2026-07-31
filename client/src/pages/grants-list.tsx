import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useGrants } from "@/hooks/use-grants";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  Filter,
  CalendarDays,
  Building,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Trash2
} from "lucide-react";
import { MatchScoreBadge } from "@/components/match-score-badge";
import { useDeleteGrant } from "@/hooks/use-grants";
import { Button } from "@/components/ui/button";

export default function GrantsListPage() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string>("all");
  const [reviewStatus, setReviewStatus] = useState<string>("all");

  const { data: grants, isLoading: isLoadingGrants } = useGrants({
    search,
    source: source === "all" ? undefined : source,
    reviewStatus: reviewStatus === "all" ? undefined : reviewStatus,
  });

  const deleteGrantMutation = useDeleteGrant();

  return (
    <LayoutShell>
      <div className="container mx-auto p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">
              Subvenciones Recibidas
            </h1>
            <p className="text-slate-500 mt-1">
              Explora las oportunidades filtradas por OpenClaw
            </p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar subvenciones..."
              className="pl-9 bg-slate-50 border-slate-200"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Fuente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las fuentes</SelectItem>
                <SelectItem value="bdns">BDNS</SelectItem>
                <SelectItem value="boe">BOE</SelectItem>
                <SelectItem value="eu-funding">Europa</SelectItem>
                <SelectItem value="openclaw">OpenClaw General</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full md:w-48">
            <Select value={reviewStatus} onValueChange={setReviewStatus}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="new">Nuevas</SelectItem>
                <SelectItem value="updated">Actualizadas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-4">
          {isLoadingGrants ? (
            Array(5)
              .fill(0)
              .map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl border border-slate-200 p-6 flex gap-4"
                >
                  <Skeleton className="h-16 w-16 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </div>
              ))
          ) : grants?.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
              <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Search className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-medium text-slate-900">
                No se encontraron subvenciones
              </h3>
              <p className="text-slate-500">
                Prueba ajustando los filtros o espera a que OpenClaw envíe más datos.
              </p>
            </div>
          ) : (
            grants?.map((grant: any) => (
              <Link key={grant.id} href={`/grants/${grant.id}`}>
                <div className="group bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer relative">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-shrink-0 flex md:flex-col items-center gap-2 md:w-24 md:border-r border-slate-100 md:pr-6">
                      <MatchScoreBadge
                        score={grant.match?.score || 0}
                        size="md"
                      />
                      <span className="text-xs text-slate-400 hidden md:block text-center mt-1">
                        Compatibilidad
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-slate-600 bg-slate-50 border-slate-200">
                              {grant.source.toUpperCase()}
                            </Badge>
                            {grant.isNew && (
                              <Badge className="bg-green-100 text-green-800 border-none hover:bg-green-200 flex items-center gap-1">
                                <Sparkles className="h-3 w-3" /> Nueva
                              </Badge>
                            )}
                            {grant.isUpdated && (
                              <Badge className="bg-amber-100 text-amber-800 border-none hover:bg-amber-200 flex items-center gap-1">
                                <RefreshCw className="h-3 w-3" /> Actualizada
                              </Badge>
                            )}
                          </div>
                          
                          <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                            {grant.title}
                          </h3>
                          
                          <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-500">
                            {grant.code && (
                              <div className="flex items-center">
                                <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{grant.code}</span>
                              </div>
                            )}
                            {grant.publishedAt && (
                              <div className="flex items-center">
                                <CalendarDays className="mr-1.5 h-4 w-4 text-slate-400" />
                                {new Date(grant.publishedAt).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 mt-2 sm:mt-0">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 z-10"
                            onClick={(e) => {
                              e.preventDefault();
                              if (confirm("¿Estás seguro de que deseas eliminar esta subvención?")) {
                                deleteGrantMutation.mutate(grant.id);
                              }
                            }}
                            disabled={deleteGrantMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 transition-colors hidden sm:block" />
                        </div>
                      </div>

                      {grant.match?.fitSummary && (
                        <div className="mt-4 pt-4 border-t border-slate-50">
                          <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                            <p className="text-sm text-blue-900 line-clamp-2">
                              <span className="font-semibold mr-2">Encaje:</span>
                              {grant.match.fitSummary}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </LayoutShell>
  );
}