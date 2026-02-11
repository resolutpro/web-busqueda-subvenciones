import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useCompany } from "@/hooks/use-companies";
import { Loader2 } from "lucide-react";
import LandingPage from "@/pages/landing";
import OnboardingPage from "@/pages/onboarding";
import DashboardPage from "@/pages/dashboard";
import GrantsListPage from "@/pages/grants-list";
import GrantDetailPage from "@/pages/grant-detail";
import CompanyProfilePage from "@/pages/company-profile";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading: authLoading } = useAuth();
  const { data: company, isLoading: companyLoading, isError } = useCompany();

  // Show generic loading while checking auth
  if (authLoading || companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in -> Landing
  if (!user) {
    return <Redirect to="/" />;
  }

  // Logged in but no company profile -> Onboarding
  // Only redirect if NOT already on onboarding page to prevent loops
  if (!company && window.location.pathname !== "/onboarding") {
    return <Redirect to="/onboarding" />;
  }

  // All good
  return <Component />;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null; // or a splash screen
  }

  return (
    <Switch>
      {/* Public Landing */}
      <Route path="/">
        {user ? <Redirect to="/dashboard" /> : <LandingPage />}
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

      <Route path="/saved">
         {/* Reusing GrantsList for now, ideally pass a prop or use a separate page */}
         <ProtectedRoute component={GrantsListPage} />
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
