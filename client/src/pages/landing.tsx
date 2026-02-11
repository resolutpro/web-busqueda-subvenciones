import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, TrendingUp, ShieldCheck, Zap } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-xl">
              S
            </div>
            <span className="font-display font-bold text-xl text-slate-900">SubvenciónMatch</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/api/login" className="text-sm font-medium text-slate-600 hover:text-primary transition-colors">
              Iniciar Sesión
            </a>
            <Button asChild className="bg-primary hover:bg-blue-700 shadow-lg shadow-blue-600/20">
              <a href="/api/login">Empezar <ArrowRight className="ml-2 h-4 w-4" /></a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800 mb-6">
                <span className="flex h-2 w-2 rounded-full bg-blue-600 mr-2"></span>
                Emparejando Subvenciones 2025
              </div>
              <h1 className="text-5xl lg:text-6xl font-display font-bold tracking-tight text-slate-900 mb-6 leading-tight">
                Financiación Inteligente para <br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Empresas Ambiciosas</span>
              </h1>
              <p className="text-lg text-slate-600 mb-8 leading-relaxed">
                Deja de buscar, empieza a solicitar. Nuestra IA conecta el perfil de tu empresa con miles de subvenciones y ayudas públicas en tiempo real.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="h-12 px-8 text-base bg-primary hover:bg-blue-700 shadow-xl shadow-blue-600/20" asChild>
                  <a href="/api/login">Encuentra tu Ayuda</a>
                </Button>
                <Button size="lg" variant="outline" className="h-12 px-8 text-base border-slate-200 text-slate-700 hover:bg-slate-50">
                  Casos de Éxito
                </Button>
              </div>
              
              <div className="mt-10 flex items-center gap-6 text-sm text-slate-500">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Subvenciones Verificadas</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Emparejamiento por IA</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Gratis para Empezar</span>
                </div>
              </div>
            </div>

            <div className="relative lg:h-[600px] w-full hidden lg:block">
              {/* Abstract UI Mockup */}
              <div className="absolute top-0 right-0 w-[90%] h-[90%] bg-gradient-to-br from-blue-600/10 to-indigo-600/10 rounded-3xl -rotate-3 transform translate-x-4"></div>
              <div className="absolute top-4 right-4 w-[90%] h-[90%] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform rotate-0 hover:-translate-y-2 transition-transform duration-500">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-400"></div>
                    <div className="h-3 w-3 rounded-full bg-amber-400"></div>
                    <div className="h-3 w-3 rounded-full bg-emerald-400"></div>
                  </div>
                  <div className="h-2 w-32 bg-slate-200 rounded-full"></div>
                </div>
                <div className="p-8 space-y-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-4 p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/50 transition-colors">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-sm ${i === 1 ? 'bg-emerald-100 text-emerald-700' : i === 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                        {i === 1 ? '98%' : i === 2 ? '85%' : '72%'}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-3/4 bg-slate-900/10 rounded"></div>
                        <div className="h-3 w-1/2 bg-slate-900/5 rounded"></div>
                      </div>
                    </div>
                  ))}
                  <div className="mt-8 p-4 bg-blue-600 rounded-xl text-white">
                    <div className="text-sm font-medium opacity-80 mb-1">Financiación Potencial</div>
                    <div className="text-3xl font-bold">€1,250,000</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl font-display font-bold text-slate-900 mb-4">¿Por qué usar SubvenciónMatch?</h2>
            <p className="text-slate-600">Simplificamos el complejo mundo de la financiación pública para que puedas centrarte en hacer crecer tu negocio.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 mb-6">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Emparejamiento Instantáneo</h3>
              <p className="text-slate-600 leading-relaxed">Nuestros algoritmos analizan tu CNAE, ubicación y tipo de proyecto para encontrar subvenciones relevantes al instante.</p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <div className="h-12 w-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 mb-6">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Maximiza la Financiación</h3>
              <p className="text-slate-600 leading-relaxed">Descubre oportunidades locales, regionales y europeas para las que no sabías que calificabas.</p>
            </div>
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <div className="h-12 w-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600 mb-6">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Fuentes Verificadas</h3>
              <p className="text-slate-600 leading-relaxed">Recopilamos datos directamente de los boletines oficiales del gobierno y verificamos cada oportunidad.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center text-white font-bold text-xs">
              S
            </div>
            <span className="font-display font-bold text-lg text-slate-900">SubvenciónMatch</span>
          </div>
          <div className="text-slate-500 text-sm">
            © 2025 SubvenciónMatch. Todos los derechos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
