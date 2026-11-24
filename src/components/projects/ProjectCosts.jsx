// Kartica „Costs" na projektu (spec §8.1, Faza C1): ukupan iznos, tabela, Add / Edit / Delete, filteri po
// kategoriji / potkategoriji / datumu, izvoz Excel/CSV i istorija izmena. Isti entitet kao centralni Project Costs (T13):
// ključ upita ["project-costs", projectId] koristi i Financial Report, pa se trošak odmah odražava u izveštaju.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Lock, Plus, Receipt, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyState from "@/components/shared/EmptyState";
import { useAuth } from "@/lib/AuthContext";
import { costExportRows, filterCosts, sortCosts, subcategoryNames, uniqueCosts } from "@/lib/projectCosts";
import CostFormDialog from "./CostFormDialog";
import CostHistoryDialog from "./CostHistoryDialog";
import CostTotals from "./CostTotals";
import { CostsTable, ExportMenu, invalidateCosts, useCostLookups } from "./costsShared";
import { useCostLabels } from "./costsLabels";

const NO_FILTERS = { categoryId: "all", subcategory: "all", from: "", to: "" };

export default function ProjectCosts({ projectId, projectName = "" }) {
  const { T, lang } = useCostLabels();
  const { can, permissions } = useAuth();
  const canView = can("costs.view");
  const canManage = can("costs.manage");
  const queryClient = useQueryClient();
  const lookup = useCostLookups(canView);

  const [filters, setFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState({ key: "cost_date", dir: "desc" });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [historyFor, setHistoryFor] = useState(undefined); // undefined = zatvoreno, null = ceo projekat, objekat = jedan trošak
  const [exporting, setExporting] = useState(false);

  const { data: raw = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["project-costs", projectId],
    queryFn: () => base44.entities.ProjectCost.filter({ project_id: projectId }, "-cost_date"),
    enabled: canView && !!projectId,
  });
  const costs = useMemo(() => uniqueCosts(raw), [raw]);

  const visible = useMemo(
    () => sortCosts(filterCosts(costs, { ...filters, projectId }, lookup), sort, lookup),
    [costs, filters, projectId, sort, lookup]
  );
  const filtered = !!(filters.categoryId !== "all" || filters.subcategory !== "all" || filters.from || filters.to);
  const category = lookup.categories.find((c) => c.id === filters.categoryId);
  const subs = category ? subcategoryNames(category) : [];

  const remove = useMutation({
    mutationFn: (id) => base44.entities.ProjectCost.delete(id),
    onSuccess: () => {
      invalidateCosts(queryClient);
      toast.success(T.deleted);
    },
  });

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "amount" || key === "cost_date" ? "desc" : "asc" }));

  const doExport = async (kind) => {
    const rows = costExportRows(visible, permissions, lookup);
    if (!rows.length) { toast.info(T.exportEmpty); return; }
    setExporting(true);
    try {
      const mod = await import("@/lib/projectCostsExport");
      const scope = (projectName || "project").normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40);
      const filterText = [
        category && `${T.category}: ${category.name}`, filters.subcategory !== "all" && `${T.subcategory}: ${filters.subcategory}`,
        filters.from && `${T.dateFrom}: ${filters.from}`, filters.to && `${T.dateTo}: ${filters.to}`,
      ].filter(Boolean).join("; ");
      if (kind === "csv") mod.exportCostsCsv(rows, { lang, filename: mod.costExportFileName("csv", scope) });
      else mod.exportCostsExcel(rows, { lang, filename: mod.costExportFileName("xlsx", scope), filterText });
      toast.success(T.exportDone);
    } catch (e) {
      console.error("[costs] export", e);
      toast.error(T.exportFailed);
    } finally {
      setExporting(false);
    }
  };

  if (!canView) {
    return (
      <Card className="p-8 text-center space-y-2">
        <Lock className="w-6 h-6 mx-auto text-muted-foreground" />
        <p className="font-medium">{T.noAccess}</p>
        <p className="text-sm text-muted-foreground">{T.noAccessHint}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" />{T.cardTitle}</h3>
          <p className="text-sm text-muted-foreground">{T.cardSubtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setHistoryFor(null)}><History className="w-4 h-4" />{T.history}</Button>
          <ExportMenu T={T} formats={["excel", "csv"]} onExport={doExport} disabled={!visible.length} busy={exporting} />
          {canManage && <Button className="gap-2" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="w-4 h-4" />{T.add}</Button>}
        </div>
      </div>

      {isError ? (
        <Card className="p-8 text-center space-y-3">
          <p className="text-sm text-destructive">{T.loadError}</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}><RefreshCw className="w-4 h-4" />{T.retry}</Button>
        </Card>
      ) : isLoading || lookup.isLoading ? (
        <div className="space-y-2">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
      ) : (
        <>
          <CostTotals costs={visible} T={T} lang={lang} />

          <div className="flex flex-wrap items-center gap-2">
            <Select value={filters.categoryId} onValueChange={(v) => setFilters((f) => ({ ...f, categoryId: v, subcategory: "all" }))}>
              <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{T.allCategories}</SelectItem>
                <SelectItem value="none">{T.uncategorized}</SelectItem>
                {lookup.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {subs.length > 0 && (
              <Select value={filters.subcategory} onValueChange={(v) => setFilters((f) => ({ ...f, subcategory: v }))}>
                <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T.allSubcategories}</SelectItem>
                  {subs.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {T.dateFrom}
              <Input type="date" className="w-40" value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              {T.dateTo}
              <Input type="date" className="w-40" value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
            </label>
            {filtered && <Button variant="ghost" size="sm" className="gap-1" onClick={() => setFilters(NO_FILTERS)}><X className="w-4 h-4" />{T.clearFilters}</Button>}
          </div>

          {costs.length === 0 ? (
            <Card>
              <EmptyState icon={Receipt} title={T.empty} description={canManage ? T.emptyHint : undefined}
                actionLabel={canManage ? T.add : undefined} onAction={() => { setEditing(null); setFormOpen(true); }} />
            </Card>
          ) : visible.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">{T.emptyFiltered}</Card>
          ) : (
            <Card className="overflow-hidden">
              <CostsTable costs={visible} lookup={lookup} T={T} lang={lang} showProject={false} sort={sort} onSort={toggleSort}
                canManage={canManage} canHistory onEdit={(c) => { setEditing(c); setFormOpen(true); }}
                onDelete={setDeleting} onHistory={setHistoryFor} />
            </Card>
          )}
        </>
      )}

      <CostFormDialog open={formOpen} onOpenChange={setFormOpen} cost={editing} lockedProjectId={projectId}
        lookup={lookup} existingCosts={costs} T={T} lang={lang} />
      <CostHistoryDialog open={historyFor !== undefined} onOpenChange={(o) => !o && setHistoryFor(undefined)}
        cost={historyFor || null} projectId={projectId} lookup={lookup} T={T} lang={lang} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{T.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{T.deleteBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{T.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { remove.mutate(deleting.id); setDeleting(null); }}>{T.delete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
