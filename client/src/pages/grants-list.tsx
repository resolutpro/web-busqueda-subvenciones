import { useState, useMemo } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useGrants, useDeleteGrant, useBulkGrantsAction, useUpdateGrant } from "@/hooks/use-grants";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  Trash2,
  Mail,
  MailOpen,
  Star,
  StarOff
} from "lucide-react";
import { MatchScoreBadge } from "@/components/match-score-badge";
import { Button } from "@/components/ui/button";

export default function GrantsListPage() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<string>("all");
  const [reviewStatus, setReviewStatus] = useState<string>("all");
  const [selectedGrants, setSelectedGrants] = useState<Set<number>>(new Set());

  const { data: grants, isLoading: isLoadingGrants } = useGrants({
    search,
    source: source === "all" ? undefined : source,
    reviewStatus: reviewStatus === "all" ? undefined : reviewStatus,
  });

  const deleteGrantMutation = useDeleteGrant();
  const bulkActionMutation = useBulkGrantsAction();
  const updateGrantMutation = useUpdateGrant();

  const sortedGrants = useMemo(() => {
    if (!grants) return [];
    return [...grants].sort((a, b) => {
      // 1. isImportant desc
      if (a.isImportant && !b.isImportant) return -1;
      if (!a.isImportant && b.isImportant) return 1;
      
      // 2. unread desc
      if (!a.isRead && b.isRead) return -1;
      if (a.isRead && !b.isRead) return 1;
      
      return 0; // Maintain default sort (score / date)
    });
  }, [grants]);

  const toggleSelection = (id: number) => {
    const newSet = new Set(selectedGrants);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedGrants(newSet);
  };

  const toggleAll = () => {
    if (selectedGrants.size === sortedGrants.length) {
      setSelectedGrants(new Set());
    } else {
      setSelectedGrants(new Set(sortedGrants.map(g => g.id)));
    }
  };

  const handleBulkAction = (action: 'mark_read' | 'mark_unread' | 'mark_important' | 'mark_unimportant' | 'delete') => {
    if (selectedGrants.size === 0) return;
    
    if (action === 'delete') {
      if (!confirm(`¿Estás seguro de que deseas eliminar ${selectedGrants.size} convocatorias?`)) return;
    }
    
    bulkActionMutation.mutate({
      ids: Array.from(selectedGrants),
      action
    }, {
      onSuccess: () => {
        if (action === 'delete') {
          setSelectedGrants(new Set());
        }
      }
    });
  };

  const isAllSelected = grants && grants.length > 0 && selectedGrants.size === grants.length;

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

        {/* Bulk Actions Toolbar */}
        {selectedGrants.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6 flex flex-wrap items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-3 ml-2">
              <span className="font-semibold text-blue-900">{selectedGrants.size} seleccionadas</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="bg-white" onClick={() => handleBulkAction('mark_read')} disabled={bulkActionMutation.isPending}>
                <MailOpen className="h-4 w-4 mr-2 text-slate-500" /> Marcar leídas
              </Button>
              <Button size="sm" variant="outline" className="bg-white" onClick={() => handleBulkAction('mark_unread')} disabled={bulkActionMutation.isPending}>
                <Mail className="h-4 w-4 mr-2 text-slate-500" /> Marcar no leídas
              </Button>
              <Button size="sm" variant="outline" className="bg-white text-amber-700 border-amber-200 hover:bg-amber-50" onClick={() => handleBulkAction('mark_important')} disabled={bulkActionMutation.isPending}>
                <Star className="h-4 w-4 mr-2 text-amber-500" fill="currentColor" /> Destacar
              </Button>
              <Button size="sm" variant="outline" className="bg-white text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleBulkAction('delete')} disabled={bulkActionMutation.isPending}>
                <Trash2 className="h-4 w-4 mr-2" /> Eliminar
              </Button>
            </div>
          </div>
        )}

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
          ) : sortedGrants.length === 0 ? (
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
            <>
              {/* Header for Select All */}
              <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100">
                <Checkbox 
                  checked={isAllSelected}
                  onCheckedChange={toggleAll}
                  className="data-[state=checked]:bg-blue-600 border-slate-300"
                />
                <span className="text-sm font-medium text-slate-500">Seleccionar todas</span>
              </div>
              
              {sortedGrants.map((grant: any) => {
                const isSelected = selectedGrants.has(grant.id);
                const isRead = grant.isRead;
                const isImportant = grant.isImportant;
                
                return (
                  <Link key={grant.id} href={`/grants/${grant.id}`}>
                    <div className={`group rounded-xl border p-4 sm:p-6 shadow-sm hover:shadow-md transition-all cursor-pointer relative flex flex-col sm:flex-row gap-4 sm:gap-6 ${
                      isImportant ? 'border-amber-300 bg-amber-50/10' : 
                      isRead ? 'border-slate-200 bg-slate-50 opacity-80 hover:opacity-100' : 'border-blue-100 bg-white'
                    } ${isSelected ? 'ring-2 ring-blue-500 border-transparent' : ''}`}>
                      
                      {/* Checkbox */}
                      <div 
                        className="absolute top-4 left-4 sm:static sm:flex-shrink-0 z-10 pt-1" 
                        onClick={(e) => {
                          e.preventDefault();
                          toggleSelection(grant.id);
                        }}
                      >
                        <Checkbox 
                          checked={isSelected}
                          className="data-[state=checked]:bg-blue-600 border-slate-300 h-5 w-5"
                        />
                      </div>

                      <div className="flex-shrink-0 flex sm:flex-col items-center gap-2 mt-6 sm:mt-0 sm:w-24 sm:border-r border-slate-100 sm:pr-6 ml-2 sm:ml-0">
                        <MatchScoreBadge
                          score={grant.match?.score || 0}
                          size="md"
                        />
                        <span className="text-xs text-slate-400 hidden sm:block text-center mt-1">
                          Compatibilidad
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              {isImportant && (
                                <Badge className="bg-amber-100 text-amber-800 border-none flex items-center gap-1 font-bold px-2 py-0.5">
                                  <Star className="h-3 w-3" fill="currentColor" /> Destacada
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-slate-600 bg-white border-slate-200 font-medium">
                                {grant.source.toUpperCase()}
                              </Badge>
                              {grant.isNew && !isRead && (
                                <Badge className="bg-green-100 text-green-800 border-none flex items-center gap-1 font-medium">
                                  <Sparkles className="h-3 w-3" /> Nueva
                                </Badge>
                              )}
                              {grant.isUpdated && !isRead && (
                                <Badge className="bg-blue-100 text-blue-800 border-none flex items-center gap-1 font-medium">
                                  <RefreshCw className="h-3 w-3" /> Actualizada
                                </Badge>
                              )}
                            </div>
                            
                            <h3 className={`text-lg font-bold group-hover:text-blue-600 transition-colors line-clamp-2 ${isRead && !isImportant ? 'text-slate-700' : 'text-slate-900'}`}>
                              {grant.title}
                            </h3>
                            
                            <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-500">
                              {grant.code && (
                                <div className="flex items-center">
                                  <span className="font-mono text-xs bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600">{grant.code}</span>
                                </div>
                              )}
                              {grant.publishedAt && (
                                <div className="flex items-center text-slate-500 font-medium">
                                  <CalendarDays className="mr-1.5 h-4 w-4 text-slate-400" />
                                  {new Date(grant.publishedAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Actions on the right */}
                          <div className="flex flex-col items-end gap-2 shrink-0 z-10" onClick={(e) => e.preventDefault()}>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              title={isImportant ? "Quitar destacado" : "Destacar"}
                              className={`h-8 w-8 ${isImportant ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50' : 'text-slate-300 hover:text-amber-500 hover:bg-amber-50'}`}
                              onClick={() => {
                                updateGrantMutation.mutate({ id: grant.id, data: { isImportant: !isImportant } });
                              }}
                            >
                              <Star className="h-5 w-5" fill={isImportant ? "currentColor" : "none"} />
                            </Button>
                          </div>
                        </div>

                        {grant.match?.fitSummary && (
                          <div className={`mt-4 pt-4 border-t ${isImportant ? 'border-amber-100' : 'border-slate-100'}`}>
                            <div className={`${isRead ? 'bg-slate-100/50' : 'bg-blue-50/50'} p-3 rounded-lg border ${isRead ? 'border-slate-200' : 'border-blue-100/50'}`}>
                              <p className={`text-sm line-clamp-2 ${isRead ? 'text-slate-600' : 'text-blue-900'}`}>
                                <span className="font-semibold mr-2">Encaje:</span>
                                {grant.match.fitSummary}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </>
          )}
        </div>
      </div>
    </LayoutShell>
  );
}