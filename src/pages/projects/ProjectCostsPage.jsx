import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Trash2, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { toast } from "sonner";

export default function ProjectCostsPage() {
  const t = useT();
  const { lang } = useLang();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState("all");
  const [formData, setFormData] = useState({ amount: "", currency: "EUR", category: "", subcategory: "", notes: "", project_id: "" });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-created_date", 200),
  });

  const { data: costCategories = [] } = useQuery({
    queryKey: ["cost-categories"],
    queryFn: () => base44.entities.CostCategory.list("name", 200),
  });

  const { data: costs = [], isLoading } = useQuery({
    queryKey: ["project-costs-all"],
    queryFn: () => base44.entities.ProjectCost.list("-created_date", 500),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ProjectCost.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-costs-all"] });
      queryClient.invalidateQueries({ queryKey: ["project-costs"] });
      setFormData({ amount: "", currency: "EUR", category: "", subcategory: "", notes: "", project_id: "" });
      setDialogOpen(false);
      toast.success(t("Cost added"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProjectCost.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-costs-all"] });
      queryClient.invalidateQueries({ queryKey: ["project-costs"] });
      toast.success(t("Cost deleted"));
    },
  });

  const handleAddCost = async () => {
    // Isto pravilo kao baza (project_costs.amount >= 0): trošak ne može biti negativan (QA 14.11.2026).
    if (Number(formData.amount) < 0) {
      toast.error(t("The amount can't be negative."));
      return;
    }
    if (!formData.amount || !formData.project_id) {
      toast.error(t("Fill all required fields"));
      return;
    }
    createMutation.mutate({
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      category: formData.category,
      subcategory: formData.subcategory || "",
      notes: formData.notes,
      project_id: formData.project_id,
    });
  };

  const filtered = costs.filter((cost) => {
    const matchSearch = !search || (cost.notes || "").toLowerCase().includes(search.toLowerCase()) || (cost.category || "").toLowerCase().includes(search.toLowerCase());
    const matchProject = selectedProject === "all" || !selectedProject || cost.project_id === selectedProject;
    return matchSearch && matchProject;
  });

  const totalEUR = filtered.filter(c => (c.currency || "EUR") === "EUR").reduce((sum, c) => sum + (c.amount || 0), 0);
  const totalRSD = filtered.filter(c => c.currency === "RSD").reduce((sum, c) => sum + (c.amount || 0), 0);

  const chartData = [
    { currency: "EUR", total: totalEUR },
    { currency: "RSD", total: totalRSD },
  ].filter(d => d.total > 0);

  const getProjectName = (projectId) => {
    const project = projects.find((p) => p.id === projectId);
    return project ? project.name : "—";
  };

  const getCategoryLabel = (key) => {
    const found = costCategories.find((c) => c.name.toLowerCase() === key?.toLowerCase() || c.id === key);
    if (found) return lang === "rs" ? (found.translation || found.name) : found.name;
    return key || "—";
  };

  const getSubcategoryLabel = (categoryKey, subcategoryKey) => {
    if (!subcategoryKey) return null;
    const cat = costCategories.find((c) => c.name.toLowerCase() === categoryKey?.toLowerCase() || c.id === categoryKey);
    const sub = cat?.subcategories?.find((s) => s.name.toLowerCase() === subcategoryKey.toLowerCase());
    if (sub) return lang === "rs" ? (sub.translation || sub.name) : sub.name;
    return subcategoryKey;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Project Costs") || "Projektni Troškovi"}
        subtitle={`${costs.length} ${t("total costs") || "ukupno troškova"}`}
        actionLabel={t("Add Cost") || "Dodaj Trošak"}
        onAction={() => setDialogOpen(true)}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("Search costs") || "Pretraga troškova..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={selectedProject} onValueChange={setSelectedProject}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder={t("All projects") || "Svi projekti"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{lang === "rs" ? "Svi projekti" : "All projects"}</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Currency Summary */}
      {!isLoading && filtered.length > 0 && (
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-6 items-center">
            <div className="flex flex-col sm:flex-row gap-6 flex-1">
              {totalEUR > 0 && (
                <div className="flex-1 text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-muted-foreground mb-1">{lang === "rs" ? "Ukupno EUR" : "Total EUR"}</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalEUR.toFixed(2)} €</p>
                </div>
              )}
              {totalRSD > 0 && (
                <div className="flex-1 text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-muted-foreground mb-1">{lang === "rs" ? "Ukupno RSD" : "Total RSD"}</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{totalRSD.toFixed(2)} RSD</p>
                </div>
              )}
            </div>
            {chartData.length > 0 && (
              <div className="w-full sm:w-56 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                    <XAxis dataKey="currency" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value, name, props) => [`${value.toFixed(2)} ${props.payload.currency}`, lang === "rs" ? "Ukupno" : "Total"]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell key={entry.currency} fill={entry.currency === "EUR" ? "#2563eb" : "#d97706"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">{t("No costs to display") || "Nema troškova za prikaz"}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((cost) => (
            <Card key={cost.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <h4 className="font-medium">{getCategoryLabel(cost.category)}{cost.subcategory ? ` / ${getSubcategoryLabel(cost.category, cost.subcategory)}` : ""}</h4>
                    <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                      {getProjectName(cost.project_id)}
                    </span>
                  </div>
                  {cost.notes && <p className="text-sm text-muted-foreground">{cost.notes}</p>}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-semibold text-primary">{cost.amount.toFixed(2)} {cost.currency || "EUR"}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteConfirmId(cost.id)}
                    disabled={deleteMutation.isPending}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}

        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Add Project Cost") || "Dodaj Projektni Trošak"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Project")} *</Label>
              <Select value={formData.project_id} onValueChange={(v) => setFormData({ ...formData, project_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={lang === "rs" ? "Izaberi projekat" : "Select project"} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.project_number ? `${p.project_number} — ${p.name}` : p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Amount") || "Iznos"} *</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  min="0"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="flex-1"
                />
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="RSD">RSD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Category") || "Kategorija"}</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v, subcategory: "" })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Select category") || "Odaberi kategoriju"} />
                </SelectTrigger>
                <SelectContent>
                  {costCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {lang === "rs" ? (cat.translation || cat.name) : cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formData.category && (() => {
              const selectedCat = costCategories.find((c) => c.name === formData.category);
              const subs = selectedCat?.subcategories || [];
              if (subs.length === 0) return null;
              return (
                <div className="space-y-2">
                  <Label>{t("Subcategory") || "Podkategorija"}</Label>
                  <Select value={formData.subcategory} onValueChange={(v) => setFormData({ ...formData, subcategory: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("Select subcategory") || "Odaberi podkategoriju"} />
                    </SelectTrigger>
                    <SelectContent>
                      {subs.map((sub) => (
                        <SelectItem key={sub.name} value={sub.name}>
                          {lang === "rs" ? (sub.translation || sub.name) : sub.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>{t("Notes") || "Napomene"}</Label>
              <Input
                placeholder={t("Additional notes (optional)") || "Dodatne napomene (opciono)"}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("Cancel") || "Otkaži"}</Button>
            <Button onClick={handleAddCost} disabled={createMutation.isPending}>{t("Add") || "Dodaj"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{lang === "rs" ? "Obriši trošak" : "Delete cost"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "rs" ? "Da li ste sigurni da želite da obrišete ovaj trošak? Ova akcija se ne može poništiti." : "Are you sure you want to delete this cost? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "rs" ? "Otkaži" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); }}
            >
              {lang === "rs" ? "Obriši" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}