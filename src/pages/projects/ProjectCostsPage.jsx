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
import { useT, pick } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { pageTitle } from "@/lib/pageTitles";
import { costCurrency, costInEur, rsdToEur, sumCostsEur, validExchangeRate } from "@/lib/payroll/costs";
import { round2 } from "@/lib/payroll/money";
import { toast } from "sonner";

const EMPTY_FORM = { amount: "", currency: "EUR", eur_rsd_rate: "", category: "", subcategory: "", notes: "", project_id: "" };

export default function ProjectCostsPage() {
  const t = useT();
  const { lang } = useLang();
  const l = (en, rs, sk) => pick(lang, en, rs, sk);
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState("all");
  const [formData, setFormData] = useState(EMPTY_FORM);

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-created_date"),
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
      setFormData(EMPTY_FORM);
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
    // D2: trošak van EUR mora imati kurs > 0 (isto pravilo kao baza, guard_project_cost); EUR iznos računa baza.
    const isEur = formData.currency === "EUR";
    const rate = isEur ? null : validExchangeRate(formData.eur_rsd_rate);
    if (!isEur && rate === null) {
      toast.error(l(`Enter the exchange rate greater than 0 (how many ${formData.currency} is 1 EUR).`,
                    `Unesite kurs veći od 0 (koliko ${formData.currency} vredi 1 EUR).`, `Zadajte kurz väčší ako 0 (koľko ${formData.currency} je 1 EUR).`));
      return;
    }
    createMutation.mutate({
      amount: parseFloat(formData.amount),
      currency: formData.currency,
      eur_rsd_rate: rate,
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

  // D2: zbir je u EUR i uključuje RSD troškove po kursu unetom uz trošak (src/lib/payroll/costs.js).
  // RSD trošak bez kursa nije u zbiru (ni kao 0, ni kao RSD) — prikazuje se posebno kao „nedostaje kurs".
  const sums = sumCostsEur(filtered);
  const totalEUR = sums.total;
  const fromRsd = sums.converted.RSD || { amount: 0, eur: 0 };
  const missingRsd = sums.missingByCurrency.RSD || 0;

  // Oba stuba su u EUR: troškovi uneti u EUR i troškovi uneti u RSD (preračunati).
  const chartData = [
    { currency: "EUR", total: round2(totalEUR - fromRsd.eur) },
    { currency: "RSD", total: fromRsd.eur },
  ].filter(d => d.total > 0);

  const getProjectName = (projectId) => {
    const project = projects.find((p) => p.id === projectId);
    return project ? project.name : "—";
  };

  const getCategoryLabel = (key) => {
    const found = costCategories.find((c) => c.name.toLowerCase() === key?.toLowerCase() || c.id === key);
    if (found) return found.name;
    return key || "—";
  };

  const getSubcategoryLabel = (categoryKey, subcategoryKey) => {
    if (!subcategoryKey) return null;
    const cat = costCategories.find((c) => c.name.toLowerCase() === categoryKey?.toLowerCase() || c.id === categoryKey);
    const sub = cat?.subcategories?.find((s) => s.name.toLowerCase() === subcategoryKey.toLowerCase());
    if (sub) return sub.name;
    return subcategoryKey;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle("Project Costs", lang)}
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
            <SelectItem value="all">{lang === "rs" ? "Svi projekti" : lang === "sk" ? "Všetky projekty" : "All projects"}</SelectItem>
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
              <div className="flex-1 text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                <p className="text-xs text-muted-foreground mb-1">{lang === "rs" ? "Ukupno EUR" : lang === "sk" ? "Spolu EUR" : "Total EUR"}</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{totalEUR.toFixed(2)} €</p>
                {fromRsd.eur > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {l(`incl. RSD costs at the entered rate: ${fromRsd.eur.toFixed(2)} €`, `uključeni RSD troškovi po unetom kursu: ${fromRsd.eur.toFixed(2)} €`, `vrátane nákladov v RSD podľa zadaného kurzu: ${fromRsd.eur.toFixed(2)} €`)}
                  </p>
                )}
              </div>
              {(fromRsd.amount > 0 || missingRsd > 0) && (
                <div className="flex-1 text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-muted-foreground mb-1">{lang === "rs" ? "Ukupno RSD" : lang === "sk" ? "Spolu RSD" : "Total RSD"}</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{(fromRsd.amount + missingRsd).toFixed(2)} RSD</p>
                  {fromRsd.amount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">{fromRsd.amount.toFixed(2)} RSD = {fromRsd.eur.toFixed(2)} €</p>
                  )}
                  {missingRsd > 0 && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-1">
                      {l(`${missingRsd.toFixed(2)} RSD missing an exchange rate — not included in the EUR total (${sums.missingRate.length})`,
                         `${missingRsd.toFixed(2)} RSD nedostaje kurs — nije uračunato u EUR zbir (${sums.missingRate.length})`, `${missingRsd.toFixed(2)} RSD bez kurzu — nezapočítané do súčtu v EUR (${sums.missingRate.length})`)}
                    </p>
                  )}
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
                      formatter={(value, name, props) => [`${value.toFixed(2)} €`, props.payload.currency === "RSD" ? l("From RSD", "Iz RSD", "Z RSD") : (lang === "rs" ? "Ukupno" : lang === "sk" ? "Spolu" : "Total")]}
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
                    <p className="text-lg font-semibold text-primary">{Number(cost.amount).toFixed(2)} {costCurrency(cost)}</p>
                    {costCurrency(cost) !== "EUR" && (costInEur(cost) === null ? (
                      <p className="text-xs font-medium text-red-600 dark:text-red-400">{l("missing exchange rate", "nedostaje kurs", "chýba kurz")}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        = {costInEur(cost).toFixed(2)} € · {l("rate", "kurs", "kurz")} {Number(cost.eur_rsd_rate)}
                      </p>
                    ))}
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
                  <SelectValue placeholder={lang === "rs" ? "Izaberi projekat" : lang === "sk" ? "Vyberte projekt" : "Select project"} />
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
            {formData.currency !== "EUR" && (() => {
              // Pregled EUR iznosa po istom pravilu kao baza (rsdToEur); sačuvan iznos računa baza.
              const preview = formData.amount ? rsdToEur(formData.amount, formData.eur_rsd_rate) : null;
              return (
                <div className="space-y-2">
                  <Label>{l(`Exchange rate (${formData.currency} for 1 EUR)`, `Kurs (${formData.currency} za 1 EUR)`, `Kurz (${formData.currency} za 1 EUR)`)} *</Label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder={l("e.g. 117.2", "npr. 117,2", "napr. 117,2")}
                    value={formData.eur_rsd_rate}
                    onChange={(e) => setFormData({ ...formData, eur_rsd_rate: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {preview === null
                      ? l("The cost is counted in EUR at this rate. No default rate.", "Trošak se u EUR računa po ovom kursu. Nema podrazumevanog kursa.", "Náklad sa v EUR počíta podľa tohto kurzu. Predvolený kurz neexistuje.")
                      : `= ${preview.toFixed(2)} €`}
                  </p>
                </div>
              );
            })()}
            <div className="space-y-2">
              <Label>{t("Category") || "Kategorija"}</Label>
              <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v, subcategory: "" })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("Select category") || "Odaberi kategoriju"} />
                </SelectTrigger>
                <SelectContent>
                  {costCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
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
                          {sub.name}
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
            <AlertDialogTitle>{lang === "rs" ? "Obriši trošak" : lang === "sk" ? "Odstrániť náklad" : "Delete cost"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "rs" ? "Da li ste sigurni da želite da obrišete ovaj trošak? Ova akcija se ne može poništiti." : lang === "sk" ? "Naozaj chcete odstrániť tento náklad? Túto akciu nemožno vrátiť späť." : "Are you sure you want to delete this cost? This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "rs" ? "Otkaži" : lang === "sk" ? "Zrušiť" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { deleteMutation.mutate(deleteConfirmId); setDeleteConfirmId(null); }}
            >
              {lang === "rs" ? "Obriši" : lang === "sk" ? "Odstrániť" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}