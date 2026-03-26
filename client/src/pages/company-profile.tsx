import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCompanySchema, type Company } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { api, buildUrl } from "@shared/routes";
import { LayoutShell } from "@/components/layout-shell";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";

export default function CompanyProfilePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  // 1. Obtener todas las empresas del usuario
  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: [api.companies.me.path],
    queryFn: async () => {
      const res = await fetch(api.companies.me.path, { credentials: "include" });
      if (!res.ok) throw new Error("Error al cargar empresas");
      return await res.json();
    },
  });

  // 2. Mutaciones para crear, actualizar y borrar (si tienes el endpoint)
  const createCompany = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(api.companies.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al crear empresa");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.companies.me.path] });
      toast({ title: "Empresa creada", description: "El perfil ha sido guardado." });
      setIsDialogOpen(false);
    }
  });

  const updateCompany = useMutation({
    mutationFn: async (data: any) => {
      const url = buildUrl(api.companies.update.path, { id: data.id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Error al actualizar empresa");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.companies.me.path] });
      toast({ title: "Empresa actualizada", description: "Los cambios han sido guardados." });
      setIsDialogOpen(false);
    }
  });

  // Formulario
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

  // Resetear el formulario cuando se abre para editar o crear
  useEffect(() => {
    if (editingCompany) {
      form.reset({
        name: editingCompany.name,
        cnae: editingCompany.cnae || "",
        location: editingCompany.location || "",
        size: editingCompany.size || "micro",
        description: editingCompany.description,
      });
    } else {
      form.reset({ name: "", cnae: "", location: "", size: "micro", description: "" });
    }
  }, [editingCompany, form, isDialogOpen]);

  async function onSubmit(data: any) {
    if (editingCompany) {
      await updateCompany.mutateAsync({ id: editingCompany.id, ...data });
    } else {
      await createCompany.mutateAsync(data);
    }
  }

  function openEditModal(company: Company) {
    setEditingCompany(company);
    setIsDialogOpen(true);
  }

  function openCreateModal() {
    setEditingCompany(null);
    setIsDialogOpen(true);
  }

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell>
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">Perfiles de Empresa</h1>
            <p className="text-slate-500">Gestiona tus empresas para buscar subvenciones simultáneamente.</p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateModal} className="bg-primary hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" /> Nueva Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCompany ? "Editar Empresa" : "Añadir Nueva Empresa"}</DialogTitle>
                <DialogDescription>
                  {editingCompany ? "Actualiza los datos para refinar la búsqueda de la IA." : "Define el perfil de tu empresa para encontrar ayudas que encajen."}
                </DialogDescription>
              </DialogHeader>

              {/* EL FORMULARIO ORIGINAL VA AQUÍ DENTRO DEL MODAL */}
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre</FormLabel>
                          <FormControl><Input {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="cnae"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>CNAE</FormLabel>
                          <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ubicación</FormLabel>
                          <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="size"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tamaño</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="micro">Micro (&lt;10 empl.)</SelectItem>
                              <SelectItem value="small">Pequeña (&lt;50 empl.)</SelectItem>
                              <SelectItem value="medium">Mediana (&lt;250 empl.)</SelectItem>
                              <SelectItem value="large">Grande (250+ empl.)</SelectItem>
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
                        <FormLabel>Descripción y Actividades</FormLabel>
                        <FormControl>
                          <Textarea className="min-h-[120px]" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={createCompany.isPending || updateCompany.isPending}>
                      {(createCompany.isPending || updateCompany.isPending) ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* LISTADO DE EMPRESAS */}
        {companies.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
            <Building2 className="mx-auto h-12 w-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No hay empresas registradas</h3>
            <p className="text-slate-500 mt-1">Añade tu primera empresa para comenzar a encontrar subvenciones.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(Array.isArray(companies) ? companies : []).map((company) => (
              <Card key={company.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl">{company.name}</CardTitle>
                      <CardDescription className="mt-1">
                        CNAE: {company.cnae || "N/A"} • {company.size}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow">
                  <p className="text-sm text-slate-600 line-clamp-4">{company.description}</p>
                  <div className="mt-3 flex items-center text-xs text-slate-500">
                    <span className="bg-slate-100 px-2 py-1 rounded">{company.location || "Ubicación no definida"}</span>
                  </div>
                </CardContent>
                <CardFooter className="pt-3 border-t bg-slate-50/50 flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => openEditModal(company)}>
                    <Pencil className="h-4 w-4 mr-1" /> Editar
                  </Button>
                  {/* Si tienes endpoint para borrar:
                  <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </Button> */}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </LayoutShell>
  );
}