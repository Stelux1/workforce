// Client Billing Overview (spec §9): interni B2B obračun po klijentu / projektu / periodu, obračuni sa statusom,
// eksterni račun, uplate i billable troškovi odvojeno. Teamora NE izdaje fakture (T29).
// Novac: src/lib/finance (laborDayLines, aggregateLabor, billingBalance) kroz src/lib/billingOverview.js.
import { useMemo, useState } from "react";
import { AlertTriangle, FilePlus2, Info, Receipt, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIsoDate } from "@/lib/dateFormat";
import { addByCurrency } from "@/lib/finance/currency";
import { BILLING_STATUS_ORDER, unbilledRevenue } from "@/lib/finance/billing";
import { sideAmount, SIDES } from "@/lib/finance/laborLines";
import {
  billableCostCandidates, costTotals, overviewByProject, summaryBalance, summaryCalculation,
} from "@/lib/billingOverview";
import BillingSummaryDialog from "./BillingSummaryDialog";
import BillingSummaryDetail from "./BillingSummaryDetail";
import BillingExport from "./BillingExport";
import { BillingStatusBadge, MoneyList, PaymentStatusBadge, money, useBillingData } from "./billingShared";

const ALL = "all";
const iso = (d) => d.toISOString().slice(0, 10);
function currentMonth() {
  const now = new Date();
  return {
    from: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))),
    to: iso(new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0))),
  };
}
const overlaps = (s, from, to) => (!from || String(s.period_end) >= from) && (!to || String(s.period_start) <= to);

function Kpi({ label, hint, byCurrency, lang, T, tone }) {
  return (
    <Card className={`p-4 shadow-card ${tone || ""}`} title={hint}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <MoneyList byCurrency={byCurrency} lang={lang} empty={T.noAmounts} className="text-xl font-semibold mt-1" />
      <p className="text-[11px] leading-tight text-muted-foreground mt-1.5">{hint}</p>
    </Card>
  );
}

const PAY_FILTERS = ["outstanding", "overdue"];

/**
 * @param {object} [params] readListParams (src/lib/listLinks.js): from, to, client, project, status=outstanding|overdue
 *   (stanje uplata) ili status obračuna, view=unbilled (samo neobračunat prihod) — linkovi sa Dashboarda (W2-I/W2-J).
 */
export default function BillingOverviewPanel({ T, lang, canManage, params = {} }) {
  const data = useBillingData(true);
  const [range, setRange] = useState(() => {
    const m = currentMonth();
    return { from: params.from || m.from, to: params.to || (params.from && params.from > m.to ? params.from : m.to) };
  });
  const [clientId, setClientId] = useState(params.client || ALL);
  const [projectId, setProjectId] = useState(params.project || ALL);
  const [status, setStatus] = useState(BILLING_STATUS_ORDER.includes(params.status) ? params.status : ALL);
  const [payFilter, setPayFilter] = useState(PAY_FILTERS.includes(params.status) ? params.status : ALL);
  const [onlyUnbilled, setOnlyUnbilled] = useState(params.view === "unbilled");
  const [creating, setCreating] = useState(null);
  const [openId, setOpenId] = useState(null);
  const today = iso(new Date());

  const clientProjects = data.projects.filter((p) => p.client_id && (clientId === ALL || p.client_id === clientId));

  // Linije perioda i filtera (samo odobreni sati, T09).
  const periodLines = useMemo(() => data.laborLines.filter((l) =>
    l.date >= range.from && l.date <= range.to
    && (clientId === ALL || l.clientId === clientId)
    && (projectId === ALL || l.projectId === projectId)), [data.laborLines, range, clientId, projectId]);
  // Problem satnice važi za period kad se njena nedelja (ponedeljak + 6 dana) seče sa periodom.
  const periodProblems = useMemo(() => data.problems.filter((p) => {
    if (!p.weekStart) return false;
    const weekEnd = iso(new Date(Date.parse(`${p.weekStart}T00:00:00Z`) + 6 * 86400000));
    if (p.weekStart > range.to || weekEnd < range.from) return false;
    const proj = data.projectsById.get(p.projectId);
    return (clientId === ALL || proj?.client_id === clientId) && (projectId === ALL || p.projectId === projectId);
  }), [data.problems, data.projectsById, range, clientId, projectId]);

  const byProjectAll = useMemo(() => overviewByProject(periodLines, data.summaries), [periodLines, data.summaries]);
  const byProject = onlyUnbilled ? byProjectAll.filter((r) => Object.keys(r.unbilled).length > 0) : byProjectAll;
  const calculated = sideAmount(periodLines.filter((l) => l.clientId), SIDES.REVENUE);
  const unbilled = unbilledRevenue(periodLines, data.summaries);

  // Obračuni u filteru (preklapanje sa periodom), sa obračunom i stanjem uplata.
  const summaries = useMemo(() => data.summaries
    .filter((s) => overlaps(s, range.from, range.to)
      && (clientId === ALL || s.client_id === clientId)
      && (projectId === ALL || !s.project_id || s.project_id === projectId)
      && (status === ALL || s.status === status))
    .map((s) => {
      const calc = summaryCalculation(s, { laborLines: data.laborLines, dbLines: data.dbLines });
      return { s, calc, balance: summaryBalance(s, data.payments, calc, today) };
    })
    .filter(({ balance: b }) => payFilter === ALL
      || (payFilter === "overdue" ? b.overdue : (b.outstanding ?? b.estimatedUnpaid ?? 0) > 0)),
  [data.summaries, data.laborLines, data.dbLines, data.payments, range, clientId, projectId, status, payFilter, today]);

  // Novčani tokovi odvojeno od obračuna (T17): eksterno fakturisano, primljeno, outstanding, estimated unpaid.
  const flows = useMemo(() => {
    let invoiced = {}, received = {}, outstanding = {}, estimated = {};
    for (const { balance: b } of summaries) {
      const c = b.currency;
      if (b.invoiced !== null) invoiced = addByCurrency(invoiced, { [c]: b.invoiced });
      if (b.received) received = addByCurrency(received, { [c]: b.received });
      if (b.outstanding !== null) outstanding = addByCurrency(outstanding, { [c]: b.outstanding });
      if (b.estimatedUnpaid !== null) estimated = addByCurrency(estimated, { [c]: b.estimatedUnpaid });
    }
    return { invoiced, received, outstanding, estimated };
  }, [summaries]);

  const billable = useMemo(() => data.costs.filter((c) => {
    const d = String(c.cost_date || "").slice(0, 10);
    const proj = data.projectsById.get(c.project_id);
    return d >= range.from && d <= range.to && (clientId === ALL || proj?.client_id === clientId) && (projectId === ALL || c.project_id === projectId);
  }), [data.costs, data.projectsById, range, clientId, projectId]);
  const candidateIds = new Set(billableCostCandidates(billable, { links: data.links, projects: data.projects }).map((c) => c.id));

  const openSummary = data.summaries.find((s) => s.id === openId) || null;
  const newDraft = (row) => ({
    client_id: row?.clientId ?? (clientId !== ALL ? clientId : null),
    project_id: row?.projectId ?? (projectId !== ALL ? projectId : null),
    period_start: range.from, period_end: range.to, currency: "EUR", notes: "",
  });

  if (data.isError) {
    return (
      <Card className="p-10 text-center space-y-3">
        <p className="text-sm text-destructive">{T.loadError}</p>
        <Button variant="outline" size="sm" className="gap-2" onClick={data.refetch}><RefreshCw className="w-4 h-4" />{T.retry}</Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl bg-primary/5 px-4 py-3 text-sm text-foreground/80">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-primary" />{T.boundary}
      </p>
      {!canManage && <p className="text-xs text-muted-foreground">{T.readOnly}</p>}

      {/* Filteri */}
      <Card className="p-4 shadow-card">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="bo-from">{T.from}</Label>
            <Input id="bo-from" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange((r) => ({ ...r, from: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bo-to">{T.to}</Label>
            <Input id="bo-to" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>{T.client}</Label>
            <Select value={clientId} onValueChange={(v) => { setClientId(v); setProjectId(ALL); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{T.allClients}</SelectItem>
                {data.clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{T.project}</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{T.allProjects}</SelectItem>
                {clientProjects.map((p) => <SelectItem key={p.id} value={p.id}>{data.lookup.projectName(p.id)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{T.status}</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{T.allStatuses}</SelectItem>
                {BILLING_STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{T.statuses[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{T.paymentStatus}</Label>
            <Select value={payFilter} onValueChange={setPayFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{T.allStatuses}</SelectItem>
                <SelectItem value="outstanding">{T.filterOpen}</SelectItem>
                <SelectItem value="overdue">{T.overdue}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm h-10 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={onlyUnbilled} onChange={(e) => setOnlyUnbilled(e.target.checked)} />
            {T.onlyUnbilled}
          </label>
        </div>
      </Card>

      {data.isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <Kpi label={T.kpiCalculated} hint={T.kpiCalculatedHint} byCurrency={calculated.byCurrency} lang={lang} T={T} />
          <Kpi label={T.kpiUnbilled} hint={T.kpiUnbilledHint} byCurrency={unbilled.revenue} lang={lang} T={T} />
          <Kpi label={T.kpiInvoiced} hint={T.kpiInvoicedHint} byCurrency={flows.invoiced} lang={lang} T={T} />
          <Kpi label={T.kpiReceived} hint={T.kpiReceivedHint} byCurrency={flows.received} lang={lang} T={T} />
          <Kpi label={T.kpiOutstanding} hint={T.kpiOutstandingHint} byCurrency={flows.outstanding} lang={lang} T={T} />
          <Kpi label={T.kpiEstimated} hint={T.kpiEstimatedHint} byCurrency={flows.estimated} lang={lang} T={T} tone="border-dashed" />
        </div>
      )}

      {(calculated.missing.length > 0 || unbilled.withoutClient > 0 || periodProblems.length > 0) && (
        <div className="space-y-1">
          {calculated.missing.length > 0 && <p className="flex items-center gap-2 text-sm text-warning"><AlertTriangle className="w-4 h-4" />{T.missingRate(calculated.missing.length)}</p>}
          {unbilled.withoutClient > 0 && <p className="flex items-center gap-2 text-sm text-warning"><AlertTriangle className="w-4 h-4" />{T.withoutClient(unbilled.withoutClient)}</p>}
          {periodProblems.length > 0 && <p className="flex items-center gap-2 text-sm text-warning"><AlertTriangle className="w-4 h-4" />{T.problemsNote(new Set(periodProblems.map((p) => p.timesheetId)).size)}</p>}
        </div>
      )}

      {/* Obračun po klijentu i projektu */}
      <Card className="shadow-card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4 border-b">
          <div>
            <h2 className="font-semibold">{T.byProjectTitle}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{T.byProjectHint} · {formatIsoDate(range.from, lang)} – {formatIsoDate(range.to, lang)}</p>
          </div>
          <div className="flex gap-2">
            <BillingExport T={T} lang={lang} formats={["excel", "csv"]} disabled={!byProject.length}
              onExport={(kind, mod) => mod.exportOverview(byProject, { T, kind, lookup: data.lookup, from: range.from, to: range.to })} />
            {canManage && <Button size="sm" className="gap-1.5" onClick={() => setCreating(newDraft())}><FilePlus2 className="w-4 h-4" />{T.createSummary}</Button>}
          </div>
        </div>
        {data.isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
        ) : byProject.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{T.noPeriodLines}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-2.5 font-medium">{T.client}</th>
                  <th className="px-4 py-2.5 font-medium">{T.project}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{T.hours}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{T.calculated}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{T.unbilled}</th>
                  <th className="px-4 py-2.5 w-px" />
                </tr>
              </thead>
              <tbody>
                {byProject.map((r) => {
                  const open = Object.keys(r.unbilled).length > 0;
                  return (
                    <tr key={`${r.clientId}-${r.projectId}`} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{data.lookup.clientName(r.clientId)}</td>
                      <td className="px-4 py-2.5">{data.lookup.projectName(r.projectId)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.hours}</td>
                      <td className="px-4 py-2.5 text-right"><MoneyList byCurrency={r.revenue} lang={lang} className="items-end" /></td>
                      <td className="px-4 py-2.5 text-right">
                        {open ? <MoneyList byCurrency={r.unbilled} lang={lang} className="items-end text-warning font-medium" /> : <span className="text-success text-xs font-medium">{T.inSummary}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {canManage && open && (
                          <Button size="sm" variant="outline" className="h-7 gap-1 whitespace-nowrap" onClick={() => setCreating(newDraft(r))}>
                            <FilePlus2 className="w-3.5 h-3.5" />{T.createSummary}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Obračuni */}
      <Card className="shadow-card overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold">{T.summariesTitle}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{T.summariesHint}</p>
        </div>
        {data.isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : summaries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">{data.summaries.length ? T.noSummariesFiltered : T.noSummaries}</p>
            {!data.summaries.length && <p className="text-sm text-muted-foreground mt-1">{T.noSummariesHint}</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-4 py-2.5 font-medium">{T.client} / {T.project}</th>
                  <th className="px-4 py-2.5 font-medium">{T.period}</th>
                  <th className="px-4 py-2.5 font-medium">{T.status}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{T.calculated}</th>
                  <th className="px-4 py-2.5 font-medium text-right hidden md:table-cell">{T.invoiced}</th>
                  <th className="px-4 py-2.5 font-medium text-right hidden md:table-cell">{T.received}</th>
                  <th className="px-4 py-2.5 font-medium text-right">{T.outstanding} / {T.estimatedUnpaid}</th>
                  <th className="px-4 py-2.5 font-medium">{T.paymentStatus}</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(({ s, calc, balance: b }) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => setOpenId(s.id)}
                    tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpenId(s.id)}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{data.lookup.clientName(s.client_id)}</p>
                      <p className="text-xs text-muted-foreground">{s.project_id ? data.lookup.projectName(s.project_id) : T.allProjectsOfClient}</p>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatIsoDate(s.period_start, lang)} – {formatIsoDate(s.period_end, lang)}</td>
                    <td className="px-4 py-2.5"><BillingStatusBadge status={s.status} T={T} /></td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {money(calc.amount, calc.currency, lang)}
                      <span className="block text-[11px] text-muted-foreground">{calc.frozen ? T.frozen : T.live}{calc.live?.differs ? " ⚠" : ""}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">{b.invoiced === null ? "—" : money(b.invoiced, b.currency, lang)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums hidden md:table-cell">{money(b.received, b.currency, lang)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {b.invoiced !== null ? money(b.outstanding, b.currency, lang) : (
                        <span className="text-muted-foreground">{money(b.estimatedUnpaid, b.currency, lang)}<span className="block text-[11px]">{T.estimatedUnpaid}</span></span>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><PaymentStatusBadge status={b.status} overdue={b.overdue} T={T} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Billable troškovi — odvojeno od obračuna (T15) */}
      <Card className="shadow-card overflow-hidden">
        <div className="p-4 border-b">
          <h2 className="font-semibold flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" />{T.billableTitle}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{T.billableHint}</p>
        </div>
        {billable.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{T.noBillable}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-4 py-2.5 font-medium">{T.date}</th>
                    <th className="px-4 py-2.5 font-medium">{T.project}</th>
                    <th className="px-4 py-2.5 font-medium hidden md:table-cell">{T.category}</th>
                    <th className="px-4 py-2.5 font-medium">{T.description}</th>
                    <th className="px-4 py-2.5 font-medium text-right">{T.amount}</th>
                    <th className="px-4 py-2.5 font-medium">{T.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {billable.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatIsoDate(c.cost_date, lang)}</td>
                      <td className="px-4 py-2.5">{data.lookup.projectName(c.project_id)}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell">{[c.category, c.subcategory].filter(Boolean).join(" / ") || "—"}</td>
                      <td className="px-4 py-2.5">{c.description || c.notes || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(c.amount, c.currency, lang)}</td>
                      <td className="px-4 py-2.5">
                        {candidateIds.has(c.id)
                          ? <span className="text-xs font-medium text-warning">{T.candidate}</span>
                          : <span className="text-xs font-medium text-success">{T.inOtherSummary}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t text-sm font-semibold">
              <span>{T.total}:</span><MoneyList byCurrency={costTotals(billable)} lang={lang} className="items-end" />
            </div>
          </>
        )}
      </Card>

      {creating && (
        <BillingSummaryDialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)} initial={creating} data={data} T={T} lang={lang}
          onCreated={(row) => row?.id && setOpenId(row.id)} />
      )}
      {openSummary && (
        <BillingSummaryDetail summary={openSummary} data={data} canManage={canManage} T={T} lang={lang} onClose={() => setOpenId(null)} />
      )}
    </div>
  );
}
