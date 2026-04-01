import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { useCompanies } from "@/hooks/use-companies";
import { Loader2 } from "lucide-react";
import LandingPage from "@/pages/landing";
import OnboardingPage from "@/pages/onboarding";
import DashboardPage from "@/pages/dashboard";
import GrantsListPage from "@/pages/grants-list";
import GrantDetailPage from "@/pages/grant-detail";
import CompanyProfilePage from "@/pages/company-profile";
import NotFound from "@/pages/not-found";
import BdnsGrantDetail from "./pages/bdns-grant-detail";
import BdnsPage from "@/pages/bdns-page";
import BoePage from "@/pages/boe-page";
import EuropaPage from "@/pages/europa-page";


// client/src/App.tsx

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading: authLoading } = useAuth();
  // Obtenemos las empresas para saber si redirigir
  const { companies, isLoading: companiesLoading } = useCompanies();

  if (authLoading || companiesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Redirect to="/" />;

  // LÓGICA INTELIGENTE: 
  // Si intenta ir a cualquier sitio y no tiene empresas -> Onboarding
  // Si ya tiene empresas e intenta ir a Onboarding -> Dashboard
  const hasCompanies = companies && companies.length > 0;
  const isAtOnboarding = window.location.pathname === "/onboarding";

  if (!hasCompanies && !isAtOnboarding) {
    return <Redirect to="/onboarding" />;
  }

  if (hasCompanies && isAtOnboarding) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

// Y en el componente Router, actualiza la raíz:
function Router() {
  const { user } = useAuth();
  const { companies } = useCompanies();
  const hasCompanies = companies && companies.length > 0;

  if (isLoading) {
    return null; // or a splash screen
  }

  return (
    <Switch>
      {/* Public Landing */}
      <Route path="/">
        {user ? (
          hasCompanies ? <Redirect to="/dashboard" /> : <Redirect to="/onboarding" />
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



      <Route path="/profile">
        <ProtectedRoute component={CompanyProfilePage} />
      </Route>

      <Route path="/bdns">
        <ProtectedRoute component={BdnsPage} />
      </Route>
      <Route path="/boe">
        <ProtectedRoute component={BoePage} />
      </Route>
      <Route path="/europa">
        <ProtectedRoute component={EuropaPage} />
      </Route>
       <Route path="/bdns-grants/:id">
          <ProtectedRoute component={BdnsGrantDetail} />
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
