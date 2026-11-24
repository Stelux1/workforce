// Payroll → Obaveze i isplate (spec §7; docs/TEAMORA-DATA-MODEL.md §2.8, traka W2-E).
// Za period: obračunata obaveza (Calculated), Paid, Remaining, Due date i status Unpaid / Partially Paid / Paid,
// po primaocu — direktnom radniku ili Vendoru (sa razradom po radniku, T12). Jedna obaveza ima više isplata (T11).
// Obračunato i stvarni odliv su odvojeni brojevi; nacrt se ne prikazuje kao dug (T17).
// Iznos obaveze računa baza (generate_payables) iz odobrenih satnica; stanje računa src/lib/finance/payables.js.
// Prava: čitanje payroll.view, generisanje/potvrda/korekcija payroll.manage, isplate payments.record (T26, RLS).
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format, parseISO } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, Lock, RefreshCw, Search, Sparkles, Wallet, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PageHeader from "@/components/shared/PageHeader";
import { ExportMenu } from "@/components/projects/costsShared";
import PayableDetail from "@/components/payroll/PayableDetail";
import { usePayablesLabels } from "@/components/payroll/payablesLabels";
import {
  DueBadge, PayableStatusBadge, fetchByIds, invalidatePayables, isoDate, money, periodText, personName,
} from "@/components/payroll/payablesShared";
import { useAuth } from "@/lib/AuthContext";
import { readListParams } from "@/lib/listLinks";
import { formatDate } from "@/lib/dateFormat";
import { payablesTotals } from "@/lib/finance/payables";
import {
  currenciesOf, dueState, filterPayableRows, monthRange, payableExportRows, payableRows, sortPayableRows,
} from "@/lib/payroll/payablesList";

const NO_FILTERS = { search: "", projectId: "all", employeeId: "all", vendorId: "all", status: "all", due: "all", payeeType: "all" };
const PAGE = 100;
const todayIso = () => format(new Date(), "yyyy-MM-dd");
const isIso = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));

// Filteri iz adrese (Dashboard, izveštaji, obaveštenja — src/lib/listLinks.js): status=unpaid|partially_paid|paid|
// draft|cancelled|open ili overdue (dospelost), project=<id>. Period from/to čita usePeriodParams.
const STATUS_PARAMS = new Set(["draft", "unpaid", "partially_paid", "paid", "cancelled", "open"]);
function filtersFromUrl(params) {
  const lp = readListParams(params);
  return {
    ...NO_FILTERS,
    status: STATUS_PARAMS.has(lp.status) ? lp.status : lp.status === "overdue" ? "open" : "all",
    due: lp.status === "overdue" ? "overdue" : "all",
    projectId: lp.project || "all",
  };
}

function usePeriodParams() {
  const [params, setParams] = useSearchParams();
  const fallback = monthRange(todayIso());
  const from = isIso(params.get("from")) ? params.get("from") : fallback.from;
  const toRaw = isIso(params.get("to")) ? params.get("to") : fallback.to;
  const to = toRaw < from ? from : toRaw;
  const setPeriod = (f, t) => {
    const next = new URLSearchParams(params);
    next.set("from", f);
    next.set("to", t);
    setParams(next, { replace: true });
  };
  return { from, to, setPeriod };
}

function SortHead({ k, sort, onSort, children, className = "" }) {
  return (
    <th className={`px-3 py-2.5 font-medium ${className}`} aria-sort={sort.key === k ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}{sort.key === k && <span aria-hidden>{sort.dir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

function Kpi({ label, value, hint, tone }) {
  return (
    <Card className="p-4 shadow-card">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${tone || ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export default function Payables() {
  const { T, lang } = usePayablesLabels();
  const { can, permissions } = useAuth();
  const canView = can("payroll.view");
  const canManage = can("payroll.manage");
  const canRecord = can("payments.record");
  const queryClient = useQueryClient();
  const today = todayIso();
  const { from, to, setPeriod } = usePeriodParams();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(() => filtersFromUrl(searchParams));
  const [sort, setSort] = useState({ key: "remaining", dir: "desc" });
  const [limit, setLimit] = useState(PAGE);
  const [openId, setOpenId] = useState(null);
  const [exporting, setExporting] = useState(false);

  // Obaveze čiji se period preklapa sa izabranim, pa njihove linije i isplate.
  const payablesQ = useQuery({
    queryKey: ["payables", "list", from, to],
    enabled: canView,
    queryFn: async () => {
      const payables = await base44.entities.Payable.filter({ period_end: { $gte: from }, period_start: { $lte: to } }, "-period_start");
      const ids = payables.map((p) => p.id);
      const [lines, payments] = await Promise.all([
        fetchByIds("PayableLine", "payable_id", ids, "created_date"),
        fetchByIds("Payment", "payable_id", ids, "payment_date"),
      ]);
      return { payables, lines, payments };
    },
  });
  const problemsQ = useQuery({
    queryKey: ["payable-problems", from, to],
    enabled: canView,
    queryFn: () => base44.rpc("payable_problems", { p_from: from, p_to: to }),
  });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: () => base44.entities.Employee.list("last_name"), enabled: canView });
  const { data: vendors = [] } = useQuery({ queryKey: ["vendors"], queryFn: () => base44.entities.Vendor.list("name"), enabled: canView });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list("name"), enabled: canView });
  const { data: users = [] } = useQuery({ queryKey: ["profiles"], queryFn: () => base44.entities.Profile.list("created_date"), enabled: canView });

  const generate = useMutation({
    mutationFn: () => base44.rpc("generate_payables", { p_from: from, p_to: to }),
    onSuccess: (n) => {
      invalidatePayables(queryClient);
      toast.success(T.generated(Number(n) || 0));
    },
    onError: (e) => toast.error(e.message),
  });

  const data = payablesQ.data;
  const rows = useMemo(
    () => (data ? payableRows(data.payables, { lines: data.lines, payments: data.payments, employees, vendors, today }) : []),
    [data, employees, vendors, today]
  );
  const filtered = useMemo(() => filterPayableRows(rows, { ...filters, today }), [rows, filters, today]);
  const visible = useMemo(() => sortPayableRows(filtered, sort), [filtered, sort]);
  const totals = useMemo(() => payablesTotals(filtered.map((r) => r.payable), data?.payments || [], { today }), [filtered, data, today]);
  const currencies = currenciesOf(filtered);
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const openRow = rows.find((r) => r.id === openId) || null;

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setLimit(PAGE); };
  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "payee" ? "asc" : "desc" }));
  const shiftMonth = (n) => {
    const m = monthRange(format(addMonths(parseISO(from), n), "yyyy-MM-dd"));
    setPeriod(m.from, m.to);
  };
  const monthLabel = (() => {
    const m = monthRange(from);
    if (m.from !== from || m.to !== to) return null;
    return formatDate(parseISO(from), "LLLL yyyy", lang).replace(/^./, (c) => c.toUpperCase());
  })();

  // Filteri: samo radnici/projekti/vendori koji se pojavljuju u obavezama perioda.
  const employeeOptions = useMemo(() => {
    const ids = new Set(rows.flatMap((r) => r.employeeIds));
    return employees.filter((e) => ids.has(e.id)).sort((a, b) => personName(a).localeCompare(personName(b)));
  }, [rows, employees]);
  const projectOptions = useMemo(() => {
    const ids = new Set(rows.flatMap((r) => r.projectIds));
    return projects.filter((p) => ids.has(p.id));
  }, [rows, projects]);
  const vendorOptions = useMemo(() => {
    const ids = new Set(rows.filter((r) => r.payeeType === "vendor").map((r) => r.payeeId));
    return vendors.filter((v) => ids.has(v.id));
  }, [rows, vendors]);

  const payeeLabel = (type, id) => (type === "vendor" ? vendors.find((v) => v.id === id)?.name : personName(employees.find((e) => e.id === id))) || T.unknownPayee;
  const problems = problemsQ.data || [];
  const problemText = (p) => {
    const who = payeeLabel(p.payee_type, p.payee_id);
    const cur = p.currency || "EUR";
    if (p.code === "labor_problem") {
      const worker = personName(employees.find((e) => e.id === p.employee_id));
      return T.pr_labor_problem(p.payee_type === "vendor" ? `${who} (${worker})` : who, isoDate(p.week_start, lang), p.detail);
    }
    if (p.code === "period_overlap") return T.pr_period_overlap(who, p.detail);
    if (p.code === "confirmed_changed") return T.pr_confirmed_changed(who, money(p.expected_amount, cur, lang), money(p.actual_amount, cur, lang));
    return T.pr_draft_outdated(who, money(p.expected_amount, cur, lang), money(p.actual_amount, cur, lang));
  };

  const doExport = async (kind) => {
    const out = payableExportRows(visible, permissions);
    if (!out.length) { toast.info(T.exportEmpty); return; }
    setExporting(true);
    try {
      const mod = await import("@/lib/payablesExport");
      const scope = `${from}_${to}`;
      const filterText = [
        `${T.period}: ${periodText(from, to, lang)}`,
        filters.search && `"${filters.search}"`,
        filters.projectId !== "all" && `${T.project}: ${projects.find((p) => p.id === filters.projectId)?.name || ""}`,
        filters.employeeId !== "all" && `${T.worker}: ${personName(employees.find((e) => e.id === filters.employeeId))}`,
        filters.vendorId !== "all" && `${T.payeeVendor}: ${vendors.find((v) => v.id === filters.vendorId)?.name || ""}`,
        filters.status !== "all" && `${T.status}: ${filters.status === "open" ? T.openOnly : T[`st_${filters.status}`]}`,
        filters.due !== "all" && `${T.due}: ${T[`due_${filters.due}`]}`,
      ].filter(Boolean).join("; ");
      if (kind === "csv") mod.exportPayablesCsv(out, { lang, scope });
      else mod.exportPayablesExcel(out, { lang, scope, filterText });
      toast.success(T.exportDone);
    } catch (e) {
      console.error("[payables] export", e);
      toast.error(T.exportFailed);
    } finally {
      setExporting(false);
    }
  };

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title={T.title} subtitle={T.subtitle} />
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
      <PageHeader title={T.title} subtitle={T.subtitle}>
        <ExportMenu T={T} formats={["excel", "csv"]} onExport={doExport} disabled={!visible.length} busy={exporting} />
        {canManage && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button className="gap-2" onClick={() => generate.mutate()} disabled={generate.isPending}>
                  <Sparkles className="w-4 h-4" />{generate.isPending ? T.generating : T.generate}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">{T.generateHint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </PageHeader>

      {/* Period */}
      <Card className="p-3 shadow-card flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium px-1">{T.period}</span>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftMonth(-1)} aria-label={T.prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
        <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shiftMonth(1)} aria-label={T.nextMonth}><ChevronRight className="w-4 h-4" /></Button>
        <Input type="date" aria-label={T.from} className="h-9 w-[150px]" value={from} onChange={(e) => isIso(e.target.value) && setPeriod(e.target.value, e.target.value > to ? e.target.value : to)} />
        <span className="text-muted-foreground">–</span>
        <Input type="date" aria-label={T.to} className="h-9 w-[150px]" value={to} min={from} onChange={(e) => isIso(e.target.value) && setPeriod(from, e.target.value < from ? from : e.target.value)} />
        {monthLabel && <span className="text-sm text-muted-foreground px-1">{monthLabel}</span>}
        <Button variant="ghost" size="sm" onClick={() => { const m = monthRange(today); setPeriod(m.from, m.to); }}>{T.thisMonth}</Button>
      </Card>

      {/* Problemi */}
      {problems.length > 0 && (
        <Card className="p-4 border-warning/40 bg-warning-soft/40 space-y-2">
          <div className="flex items-center gap-2 text-warning"><AlertTriangle className="w-4 h-4" /><p className="text-sm font-semibold">{T.problemsTitle}</p></div>
          <p className="text-xs text-muted-foreground">{T.problemsHint}</p>
          <ul className="space-y-1 text-sm">
            {problems.slice(0, 20).map((p, i) => (
              <li key={`${p.code}-${p.payable_id || p.timesheet_id || i}`} className="flex gap-2">
                <span className="text-warning">•</span>
                {p.payable_id && rows.some((r) => r.id === p.payable_id)
                  ? <button type="button" className="text-left hover:underline" onClick={() => setOpenId(p.payable_id)}>{problemText(p)}</button>
                  : <span>{problemText(p)}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* KPI po valuti: obračunato i stvarni odliv odvojeno */}
      {payablesQ.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : currencies.length > 0 && (
        <div className="space-y-2">
          {currencies.map((cur) => {
            const t = totals[cur];
            if (!t) return null;
            return (
              <div key={cur} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label={`${T.calculated} (${cur})`} value={money(t.calculated, cur, lang)} hint={t.draftCount ? T.draftCount(t.draftCount) : T.payablesCount(t.count)} />
                <Kpi label={`${T.paid} (${cur})`} value={money(t.paid, cur, lang)} tone="text-success" />
                <Kpi label={`${T.remaining} (${cur})`} value={money(t.remaining, cur, lang)} hint={`${T.confirmed}: ${money(t.confirmed, cur, lang)}`} tone={t.remaining > 0 ? "text-warning" : ""} />
                <Kpi label={`${T.overdue} (${cur})`} value={money(t.overdue, cur, lang)} tone={t.overdue > 0 ? "text-destructive" : ""} />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">{T.kpiHint}{currencies.length > 1 ? ` ${T.currencyNote}` : ""}</p>
        </div>
      )}

      {/* Filteri */}
      <Card className="p-3 shadow-card space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9 h-9" placeholder={T.search} value={filters.search} onChange={(e) => set({ search: e.target.value })} />
          </div>
          <Select value={filters.payeeType} onValueChange={(v) => set({ payeeType: v })}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.allPayees}</SelectItem>
              <SelectItem value="employee">{T.payeeEmployee}</SelectItem>
              <SelectItem value="vendor">{T.payeeVendor}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filters.projectId} onValueChange={(v) => set({ projectId: v })}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.allProjects}</SelectItem>
              {projectOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.employeeId} onValueChange={(v) => set({ employeeId: v })}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.allWorkers}</SelectItem>
              {employeeOptions.map((e) => <SelectItem key={e.id} value={e.id}>{personName(e)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.vendorId} onValueChange={(v) => set({ vendorId: v })}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.allVendors}</SelectItem>
              {vendorOptions.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.status} onValueChange={(v) => set({ status: v })}>
            <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.allStatuses}</SelectItem>
              <SelectItem value="open">{T.openOnly}</SelectItem>
              {["draft", "unpaid", "partially_paid", "paid", "cancelled"].map((s) => <SelectItem key={s} value={s}>{T[`st_${s}`]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.due} onValueChange={(v) => set({ due: v })}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{T.allDue}</SelectItem>
              {["overdue", "due_soon", "not_due", "no_due_date"].map((d) => <SelectItem key={d} value={d}>{T[`due_${d}`]}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasFilters && <Button variant="ghost" size="sm" className="h-9 gap-1" onClick={() => set(NO_FILTERS)}><X className="w-4 h-4" />{T.clearFilters}</Button>}
        </div>
      </Card>

      {/* Tabela */}
      {payablesQ.isError ? (
        <Card className="p-10 text-center space-y-3">
          <p className="text-sm text-destructive">{T.loadError}</p>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => payablesQ.refetch()} disabled={payablesQ.isFetching}><RefreshCw className="w-4 h-4" />{T.retry}</Button>
        </Card>
      ) : payablesQ.isLoading ? (
        <Card className="p-4 space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</Card>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center space-y-2">
          <Wallet className="w-6 h-6 mx-auto text-muted-foreground" />
          <p className="font-medium">{T.empty}</p>
          <p className="text-sm text-muted-foreground">{T.emptyHint}</p>
        </Card>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">{T.emptyFiltered}</Card>
      ) : (
        <Card className="shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground text-left">
                <tr>
                  <SortHead sort={sort} onSort={toggleSort} k="payee">{T.payee}</SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="period">{T.period}</SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="total" className="text-right">{T.calculated}</SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="paid" className="text-right">{T.paid}</SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="remaining" className="text-right">{T.remaining}</SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="due">{T.due}</SortHead>
                  <SortHead sort={sort} onSort={toggleSort} k="status">{T.status}</SortHead>
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, limit).map((r) => {
                  const ds = dueState(r, today);
                  const owed = r.status === "unpaid" || r.status === "partially_paid";
                  return (
                    <tr key={r.id} className="border-t hover:bg-muted/40 cursor-pointer" onClick={() => setOpenId(r.id)}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{r.payeeName || T.unknownPayee}</p>
                        <p className="text-xs text-muted-foreground">
                          {r.payeeType === "vendor" ? `${T.payeeVendor} · ${r.workerCount} ${T.workers.toLowerCase()}` : T.payeeEmployee} · {r.hours.toFixed(2)} h
                        </p>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{periodText(r.periodStart, r.periodEnd, lang)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                        {money(r.balance.total, r.currency, lang)}
                        {Number(r.payable.adjustments_amount) !== 0 && (
                          <p className="text-[11px] text-muted-foreground">{T.adjustments}: {money(r.payable.adjustments_amount, r.currency, lang)}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap text-success">{r.balance.paid ? money(r.balance.paid, r.currency, lang) : "—"}</td>
                      <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-medium ${owed ? (ds === "overdue" ? "text-destructive" : "text-warning") : ""}`}>
                        {owed ? money(r.balance.remaining, r.currency, lang) : "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <p>{r.dueDate ? isoDate(r.dueDate, lang) : <span className="text-muted-foreground">{T.noDueDate}</span>}</p>
                        {owed && <DueBadge state={ds === "no_due_date" ? null : ds} T={T} />}
                      </td>
                      <td className="px-3 py-2.5"><PayableStatusBadge status={r.status} T={T} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span>{T.shown(Math.min(limit, visible.length), visible.length)}</span>
            {visible.length > limit && <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + PAGE)}>{T.showMore}</Button>}
          </div>
        </Card>
      )}

      <PayableDetail row={openRow} open={Boolean(openRow)} onOpenChange={(o) => !o && setOpenId(null)} T={T} lang={lang}
        canManage={canManage} canRecord={canRecord} employees={employees} projects={projects} users={users} />
    </div>
  );
}
