import { useCompany } from "@/hooks/use-companies";
import { useGrants } from "@/hooks/use-grants";
import { LayoutShell } from "@/components/layout-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MatchScoreBadge } from "@/components/match-score-badge";
import { Link } from "wouter";
import { ArrowRight, Wallet, Clock, TrendingUp, Sparkles, Building2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMatches } from "@/hooks/use-matches";

export default function DashboardPage() {
  const { data: company, isLoading: loadingCompany } = useCompany();
  const { data: grants, isLoading: loadingGrants } = useGrants();
  const { data: matches, isLoading: loadingMatches } = useMatches();

  if (loadingCompany || loadingGrants || loadingMatches) {
    return (
      <LayoutShell>
        <div className="space-y-8">
          <Skeleton className="h-12 w-1/3" />
          <div className="grid md:grid-cols-3 gap-6">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </LayoutShell>
    );
  }

  // Calculate stats
  const savedMatches = matches?.filter(m => m.status === 'saved') || [];
  const appliedMatches = matches?.filter(m => m.status === 'applied') || [];
  const highMatches = grants?.filter(g => (g.match?.score || 0) > 80) || [];
  const totalPotentialFunding = highMatches.reduce((acc, curr) => acc + (curr.budget || 0), 0);

  return (
    <LayoutShell>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">
              Buenos días, {company?.name}
            </h1>
            <p className="text-slate-500 mt-1">Here's your funding overview for today.</p>
          </div>
          <Button asChild>
            <Link href="/grants">Find New Grants <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">New Opportunities</p>
                  <h3 className="text-2xl font-bold text-slate-900">{highMatches.length}</h3>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                  <Clock className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">In Progress</p>
                  <h3 className="text-2xl font-bold text-slate-900">{appliedMatches.length}</h3>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <Wallet className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-500">Potential Funding</p>
                  <h3 className="text-2xl font-bold text-slate-900">€{totalPotentialFunding.toLocaleString()}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Matches Section */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-600" />
              Top Recommendations
            </h2>
            <Link href="/grants" className="text-sm font-medium text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {highMatches.slice(0, 3).map((grant) => (
              <Link key={grant.id} href={`/grants/${grant.id}`}>
                <div className="group bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-lg hover:border-blue-200 transition-all cursor-pointer h-full flex flex-col relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4">
                    <MatchScoreBadge score={grant.match?.score || 0} size="sm" showLabel={false} />
                  </div>
                  
                  <div className="mb-4">
                    <div className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-800 mb-2">
                      {grant.scope}
                    </div>
                    <h3 className="font-bold text-slate-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                      {grant.title}
                    </h3>
                  </div>

                  <div className="mt-auto space-y-4">
                    <div className="flex items-center text-sm text-slate-500">
                      <Building2 className="mr-2 h-4 w-4" />
                      <span className="truncate">{grant.organismo}</span>
                    </div>
                    {grant.budget && (
                      <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                        <span className="text-xs text-slate-500 font-medium uppercase">Budget</span>
                        <span className="font-bold text-slate-900">€{grant.budget.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </LayoutShell>
  );
}
