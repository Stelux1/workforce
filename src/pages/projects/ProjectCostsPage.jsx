// Projects → Project Costs (spec §8.2, Faza C2): centralna tabela troškova SVIH projekata i analitika po kategorijama.
// To je isti entitet kao kartica Costs na projektu (T13) — trošak se čuva jednom, ovde se samo drugačije gleda.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Lock, Receipt, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import CostFormDialog from "@/components/projects/CostFormDialog";
import CostHistoryDialog from "@/components/projects/CostHistoryDialog";
import CostTotals from "@/components/projects/CostTotals";
import { CostsTable, ExportMenu, costProjectLabel, invalidateCosts, useCostLookups } from "@/components/projects/costsShared";
import { useCostLabels } from "@/components/projects/costsLabels";
import { useAuth } from "@/lib/AuthContext";
import { intlLocale } from "@/lib/dateFormat";
import { sortCurrencies } from "@/lib/finance/currency";
import { pageTitle } from "@/lib/pageTitles";
import {
  categoryRowsForCurrency, costExportRows, costTotalsByCurrency, costsByCategory, filterCosts, formatMoney, sortCosts,
  subcategoryNames, uniqueCosts,
} from "@/lib/projectCosts";

const NO_FILTERS = { search: "", projectId: "all", clientId: "all", categoryId: "all", subcategory: "all", from: "", to: "", billable: "all" };
const PAGE = 100;

export default function ProjectCostsPage() {
  const { T, lang } = useCostLabels();
  const locale = intlLocale(lang);
  const { can, permissions } = useAuth();
  const canView = can("costs.view");
  const canManage = can("costs.manage");
  const queryClient = useQueryClient();
  const lookup = useCostLookups(canView);
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list("name"), enabled: canView });

  const [filters, setFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState({ key: "cost_date", dir: "desc" });
  const [limit, setLimit] = useState(PAGE);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [historyFor, setHistoryFor] = useState(undefined);
  const [chartCurrency, setChartCurrency] = useState(null);
  const [exporting, setExporting] = useState(false);

  const { data: raw = [], isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["project-costs", "all"],
    queryFn: () => base44.entities.ProjectCost.list("-cost_date"),
    enabled: canView,
  });
  const costs = useMemo(() => uniqueCosts(raw), [raw]);

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setLimit(PAGE); };
  const filtered = useMemo(() => filterCosts(costs, filters, lookup), [costs, filters, lookup]);
  const visible = useMemo(() => sortCosts(filtered, sort, lookup), [filtered, sort, lookup]);
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const category = lookup.categories.find((c) => c.id === filters.categoryId);
  const subs = category ? subcategoryNames(category) : [];

  const rows = useMemo(() => costsByCategory(filtered, lookup.categories), [filtered, lookup.categories]);
  const currencies = sortCurrencies(Object.keys(costTotalsByCurrency(filtered)));
  const activeCurrency = currencies.includes(chartCurrency) ? chartCurrency : currencies[0];
  const chartRows = useMemo(
    () => (activeCurrency ? categoryRowsForCurrency(rows, activeCurrency).slice(0, 12).map((r) => ({ ...r, label: r.name || T.noCategoryRow })) : []),
    [rows, activeCurrency, T.noCategoryRow]
  );

  const remove = useMutation({
    mutationFn: (id) => base44.entities.ProjectCost.delete(id),
    onSuccess: () => {
      invalidateCosts(queryClient);
      toast.success(T.deleted);
    },
  });

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "amount" || key === "cost_date" ? "desc" : "asc" }));

  // Izvoz je CEO filtrirani skup (ne samo prikazanih 100 redova), po trenutnom sortiranju.
  const doExport = async (kind) => {
    const exportRows = costExportRows(visible, permissions, lookup);
    if (!exportRows.length) { toast.info(T.exportEmpty); return; }
    setExporting(true);
    try {
      const mod = await import("@/lib/projectCostsExport");
      const projectName = filters.projectId !== "all" ? costProjectLabel(lookup.projects.find((p) => p.id === filters.projectId)) : "";
      const filterText = [
        filters.search && `"${filters.search}"`, projectName && `${T.project}: ${projectName}`,
        filters.clientId !== "all" && `${T.client}: ${clients.find((c) => c.id === filters.clientId)?.name || ""}`,
        category && `${T.category}: ${category.name}`, filters.subcategory !== "all" && `${T.subcategory}: ${filters.subcategory}`,
        filters.from && `${T.dateFrom}: ${filters.from}`, filters.to && `${T.dateTo}: ${filters.to}`,
        filters.billable === "yes" && T.billableYes, filters.billable === "no" && T.billableNo,
      ].filter(Boolean).join("; ");
      if (kind === "csv") mod.exportCostsCsv(exportRows, { lang });
      else if (kind === "pdf") await mod.exportCostsPdf(exportRows, { lang, filterText });
      else mod.exportCostsExcel(exportRows, { lang, filterText });
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
      <div className="space-y-6">
        <PageHeader title={pageTitle("Project Costs", lang)} subtitle={T.centralSubtitle} />
        <Card className="p-10 text-center space-y-2">
          <Lock className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="font-medium">{T.noAccess}</p>
          <p className="text-sm text-muted-foreground">{T.noAccessHint}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle("Project Costs", lang)}
        subtitle={`${T.centralSubtitle} · ${T.totalFor(costs.length)}`}
        actionLabel={canManage ? T.add : undefined}
        onAction={() => { setEditing(null); setFormOpen(true); }}
      >
        <ExportMenu T={T} formats={["excel", "csv", "pdf"]} onExport={doExport} disabled={!visible.length} busy={exporting} />
      </PageHeader>

      {isError ? (
        <Card className="p-10 text-center space-y-3">
          <p className="text-sm text-destructive">{T.loadError}</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => refetch()} disabled={isFetching}><RefreshCw className="w-4 h-4" />{T.retry}</Button>
        </Card>
      ) : isLoading || lookup.isLoading ? (
        <div className="space-y-3">{Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : (
        <>
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[14rem]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input className="pl-10" placeholder={T.search} value={filters.search} onChange={(e) => set({ search: e.target.value })} />
              </div>
              <Select value={filters.projectId} onValueChange={(v) => set({ projectId: v })}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T.allProjects}</SelectItem>
                  {lookup.projects.map((p) => <SelectItem key={p.id} value={p.id}>{costProjectLabel(p)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.clientId} onValueChange={(v) => set({ clientId: v })}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T.allClients}</SelectItem>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={filters.categoryId} onValueChange={(v) => set({ categoryId: v, subcategory: "all" })}>
                <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T.allCategories}</SelectItem>
                  <SelectItem value="none">{T.uncategorized}</SelectItem>
                  {lookup.categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {subs.length > 0 && (
                <Select value={filters.subcategory} onValueChange={(v) => set({ subcategory: v })}>
                  <SelectTrigger className="w-full sm:w-52"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{T.allSubcategories}</SelectItem>
                    {subs.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                {T.dateFrom}
                <Input type="date" className="w-40" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                {T.dateTo}
                <Input type="date" className="w-40" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />
              </label>
              <Select value={filters.billable} onValueChange={(v) => set({ billable: v })}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{T.billableAll}</SelectItem>
                  <SelectItem value="yes">{T.billableYes}</SelectItem>
                  <SelectItem value="no">{T.billableNo}</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters && <Button variant="ghost" size="sm" className="gap-1" onClick={() => { setFilters(NO_FILTERS); setLimit(PAGE); }}><X className="w-4 h-4" />{T.clearFilters}</Button>}
            </div>
          </Card>

          <CostTotals costs={filtered} T={T} lang={lang} showBillable />

          {chartRows.length > 0 && (
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                <div>
                  <h2 className="font-semibold">{T.byCategory}</h2>
                  <p className="text-xs text-muted-foreground">{T.byCategoryHint}</p>
                </div>
                {currencies.length > 1 && (
                  <div className="flex items-center gap-1" role="group" aria-label={T.showIn}>
                    {currencies.map((cur) => (
                      <Button key={cur} size="sm" variant={cur === activeCurrency ? "secondary" : "ghost"} onClick={() => setChartCurrency(cur)}>{cur}</Button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ height: Math.max(140, chartRows.length * 34 + 30) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "hsl(var(--muted))" }}
                      formatter={(v, _n, item) => [formatMoney(v, activeCurrency, locale), `${item.payload.label} · ${item.payload.count} ${T.countShort}`]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--popover))", color: "hsl(var(--popover-foreground))" }} />
                    <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-t first:border-0">
                        <td className="py-1.5 pr-3 font-medium">{r.name || T.noCategoryRow}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{r.count} {T.countShort}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {sortCurrencies(Object.keys(r.byCurrency)).map((cur) => <span key={cur} className="ml-3">{formatMoney(r.byCurrency[cur], cur, locale)}</span>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {costs.length === 0 ? (
            <Card>
              <EmptyState icon={Receipt} title={T.emptyCentral} description={canManage ? T.emptyCentralHint : undefined}
                actionLabel={canManage ? T.add : undefined} onAction={() => { setEditing(null); setFormOpen(true); }} />
            </Card>
          ) : visible.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">{T.emptyFiltered}</Card>
          ) : (
            <Card className="overflow-hidden">
              <CostsTable costs={visible.slice(0, limit)} lookup={lookup} T={T} lang={lang} sort={sort} onSort={toggleSort}
                canManage={canManage} canHistory onEdit={(c) => { setEditing(c); setFormOpen(true); }}
                onDelete={setDeleting} onHistory={setHistoryFor} />
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                <span>{T.page} {Math.min(limit, visible.length)} {T.of} {visible.length}</span>
                {visible.length > limit && <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + PAGE)}>{T.showMore}</Button>}
              </div>
            </Card>
          )}
        </>
      )}

      <CostFormDialog open={formOpen} onOpenChange={setFormOpen} cost={editing} lockedProjectId={editing?.project_id}
        lookup={lookup} existingCosts={costs} T={T} lang={lang} />
      <CostHistoryDialog open={historyFor !== undefined} onOpenChange={(o) => !o && setHistoryFor(undefined)}
        cost={historyFor || null} projectId={historyFor?.project_id} lookup={lookup} T={T} lang={lang} />

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
