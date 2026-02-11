import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCompanySchema } from "@shared/schema";
import { useCreateCompany } from "@/hooks/use-companies";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, Building2, MapPin } from "lucide-react";

export default function OnboardingPage() {
  const [, navigate] = useLocation();
  const createCompany = useCreateCompany();

  const form = useForm({
    resolver: zodResolver(insertCompanySchema),
    defaultValues: {
      name: "",
      cnae: "",
      location: "",
      size: "micro",
      description: "",
    },
  });

  async function onSubmit(data: any) {
    await createCompany.mutateAsync(data);
    navigate("/dashboard");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4 shadow-lg shadow-blue-500/30">
            S
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-900">Bienvenido a SubvenciónMatch</h1>
          <p className="text-slate-600 mt-2">Vamos a configurar el perfil de tu empresa para encontrar las mejores subvenciones para ti.</p>
        </div>

        <Card className="border-slate-200 shadow-xl">
          <CardHeader>
            <CardTitle>Detalles de la Empresa</CardTitle>
            <CardDescription>
              Esta información ayuda a nuestra IA a emparejarte con oportunidades de financiación relevantes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de la Empresa</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input placeholder="Acme Inc." className="pl-9" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cnae"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código CNAE</FormLabel>
                        <FormControl>
                          <Input placeholder="ej. 6201" {...field} value={field.value || ''} />
                        </FormControl>
                        <FormDescription>Opcional pero recomendado.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ubicación (Ciudad/Región)</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input placeholder="Madrid, España" className="pl-9" {...field} value={field.value || ''} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="size"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tamaño de la Empresa</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar tamaño" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="micro">Micro (&lt;10 empleados)</SelectItem>
                            <SelectItem value="small">Pequeña (&lt;50 empleados)</SelectItem>
                            <SelectItem value="medium">Mediana (&lt;250 empleados)</SelectItem>
                            <SelectItem value="large">Grande (250+ empleados)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción del Negocio</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Briefcase className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                          <Textarea 
                            placeholder="Describe qué hace tu empresa, tu sector y proyectos típicos..." 
                            className="pl-9 min-h-[120px]" 
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Crucial para el emparejamiento por IA. Sé detallado sobre tus actividades.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full h-11 text-base bg-primary hover:bg-blue-700 shadow-lg shadow-blue-500/20"
                  disabled={createCompany.isPending}
                >
                  {createCompany.isPending ? "Creando Perfil..." : "Completar Configuración"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
