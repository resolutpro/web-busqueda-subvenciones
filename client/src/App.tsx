import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import LandingPage from "@/pages/landing";
import OnboardingPage from "@/pages/onboarding";
import DashboardPage from "@/pages/dashboard";
import GrantsListPage from "@/pages/grants-list";
import GrantDetailPage from "@/pages/grant-detail";
import CompanyProfilePage from "@/pages/company-profile";
import CompaniesListPage from "@/pages/companies-list";
import NotFound from "@/pages/not-found";


// client/src/App.tsx

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Redirect to="/" />;

  return <Component />;
}

function Router() {
  const { user, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Switch>
      {/* Public Landing */}
      <Route path="/">
        {user ? (
          <Redirect to="/dashboard" />
        ) : (
          <LandingPage />
        )}
      </Route>

      {/* Protected Routes */}
      <Route path="/onboarding">
        {user ? <OnboardingPage /> : <Redirect to="/" />}
      </Route>
      
      <Route path="/dashboard">
        <ProtectedRoute component={DashboardPage} />
      </Route>

      <Route path="/grants">
        <ProtectedRoute component={GrantsListPage} />
      </Route>

      <Route path="/grants/:id">
        <ProtectedRoute component={GrantDetailPage} />
      </Route>

      <Route path="/profile">
        <ProtectedRoute component={CompanyProfilePage} />
      </Route>

      <Route path="/companies">
        <ProtectedRoute component={CompaniesListPage} />
      </Route>

      {/* Fallback */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
