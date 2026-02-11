import { useState } from "react";
import { LayoutShell } from "@/components/layout-shell";
import { useGrants } from "@/hooks/use-grants";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MatchScoreBadge } from "@/components/match-score-badge";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Search, Filter, CalendarDays, Euro, Building, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";

export default function GrantsListPage() {
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<string>("");
  const { data: grants, isLoading } = useGrants({ search, scope: scope === "all" ? undefined : scope });

  return (
    <LayoutShell>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">Grant Opportunities</h1>
            <p className="text-slate-500 mt-1">Explore funding matched to your profile</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search grants..." 
              className="pl-9 bg-slate-50 border-slate-200" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="w-full md:w-48">
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="All Scopes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Scopes</SelectItem>
                <SelectItem value="Nacional">Nacional</SelectItem>
                <SelectItem value="Autonomico">Autonomico</SelectItem>
                <SelectItem value="Europeo">Europeo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-6 flex gap-4">
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
              <h3 className="text-lg font-medium text-slate-900">No grants found</h3>
              <p className="text-slate-500">Try adjusting your filters or search terms.</p>
            </div>
          ) : (
            grants?.map((grant) => (
              <Link key={grant.id} href={`/grants/${grant.id}`}>
                <div className="group bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer relative">
                  <div className="flex flex-col md:flex-row gap-6">
                    {/* Match Score */}
                    <div className="flex-shrink-0 flex md:flex-col items-center gap-2 md:w-24 md:border-r border-slate-100 md:pr-6">
                      <MatchScoreBadge score={grant.match?.score || 0} size="md" />
                      <span className="text-xs text-slate-400 hidden md:block text-center">Compatibility</span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1">
                            {grant.title}
                          </h3>
                          <div className="flex flex-wrap gap-3 mt-2 text-sm text-slate-500">
                            <div className="flex items-center">
                              <Building className="mr-1.5 h-4 w-4 text-slate-400" />
                              {grant.organismo}
                            </div>
                            <div className="flex items-center">
                              <CalendarDays className="mr-1.5 h-4 w-4 text-slate-400" />
                              Deadline: {grant.endDate ? new Date(grant.endDate).toLocaleDateString() : 'Open'}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 transition-colors hidden sm:block" />
                      </div>

                      {/* Footer/Badges */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-50">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700 hover:bg-slate-200">
                            {grant.scope}
                          </Badge>
                          {(grant.tags as string[])?.slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-slate-600 border-slate-200">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                        {grant.budget && (
                          <div className="flex items-center font-medium text-slate-900 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                            <Euro className="mr-1.5 h-4 w-4 text-emerald-600" />
                            {grant.budget.toLocaleString()}
                          </div>
                        )}
                      </div>
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
