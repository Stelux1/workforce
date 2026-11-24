// Detalj jednog Billing Summary-ja (spec §9): obračun (linije / po radniku / po ulozi), status, eksterni račun,
// uplate, billable troškovi odvojeno i izvoz. Ekran i izvoz koriste iste redove (summaryCalculation).
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Ban, History, Info, Plus, Receipt, Trash2, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { useAuth } from "@/lib/AuthContext";
import { useStaffDirectory } from "@/hooks/useStaffDirectory";
import { useL } from "@/lib/translations";
import { formatDate, formatIsoDate } from "@/lib/dateFormat";
import { roleLabel } from "@/lib/permissions";
import {
  billableCostCandidates, billingExportData, breakdownRows, costTotals, isPreparation, linkedCosts, rowsTotals,
  summaryBalance, summaryCalculation,
} from "@/lib/billingOverview";
import BillingStatusControl from "./BillingStatusControl";
import ExternalInvoiceForm from "./ExternalInvoiceForm";
import BillingExport from "./BillingExport";
import { ClientPaymentDialog, VoidPaymentDialog } from "./ClientPaymentDialog";
import { BILLING_KEY, MoneyList, PaymentStatusBadge, money, useInvalidateBilling } from "./billingShared";

const todayIso = () => new Date().toISOString().slice(0, 10);

function Stat({ label, hint, children, tone }) {
  return (
    <div className={`rounded-xl border p-3 ${tone || ""}`} title={hint}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="text-lg font-semibold tabular-nums mt-0.5">{children}</div>
    </div>
  );
}

export default function BillingSummaryDetail({ summary, data, canManage, T, lang, onClose }) {
  const { user } = useAuth();
  const staff = useStaffDirectory();
  const tr = useL();
  const invalidate = useInvalidateBilling();
  const [view, setView] = useState("lines");
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const calc = useMemo(() => summaryCalculation(summary, { laborLines: data.laborLines, dbLines: data.dbLines }), [summary, data.laborLines, data.dbLines]);
  const balance = summaryBalance(summary, data.payments, calc, todayIso());
  const payments = data.payments.filter((p) => p.billing_summary_id === summary.id);
  const linked = linkedCosts(summary, data.links, data.costs);
  const candidates = billableCostCandidates(data.costs, {
    links: data.links, projects: data.projects, clientId: summary.client_id, projectId: summary.project_id,
    from: summary.period_start, to: summary.period_end,
  });
  const prep = isPreparation(summary);
  const totals = rowsTotals(calc.rows);
  const cur = calc.currency;

  const history = useQuery({
    queryKey: [...BILLING_KEY, "history", summary.id],
    queryFn: async () => {
      const [rows, audit] = await Promise.all([
        base44.entities.BillingStatusHistory.filter({ summary_id: summary.id }, "changed_at"),
        base44.entities.AuditLog.filter({ table_name: "billing_summaries", record_id: summary.id, action: "status" }).catch(() => []),
      ]);
      const roleAt = new Map(audit.map((a) => [a.occurred_at, a.actor_role]));
      return rows.map((h) => ({ ...h, actorRole: roleAt.get(h.changed_at) || null }));
    },
  });

  const link = useMutation({
    mutationFn: (costId) => base44.entities.BillingSummaryCost.create({ summary_id: summary.id, project_cost_id: costId }),
    onSuccess: () => { invalidate(); toast.success(T.costAdded); },
    onError: (e) => toast.error(e.message),
  });
  const unlink = useMutation({
    mutationFn: (costId) => {
      const row = data.links.find((l) => l.summary_id === summary.id && l.project_cost_id === costId);
      return base44.entities.BillingSummaryCost.delete(row.id);
    },
    onSuccess: () => { invalidate(); toast.success(T.costRemoved); },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => base44.entities.BillingSummary.delete(summary.id),
    onSuccess: () => { invalidate(); toast.success(T.deleted); onClose(); },
    onError: (e) => toast.error(e.message),
  });

  const L = data.lookup;
  const exportData = () => billingExportData(summary, calc, { costs: linked, balance, lookup: L });
  const who = (h) => {
    const name = staff.name(h.changed_by) || (h.changed_by && h.changed_by === user?.id ? user.full_name || user.email : null);
    const role = h.actorRole || staff.role(h.changed_by);
    if (name) return role ? `${name} (${roleLabel(role, lang)})` : name;
    return role ? roleLabel(role, lang) : "—";
  };

  const table = view === "lines" ? (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/50 text-left">
          <th className="px-3 py-2 font-medium">{T.project}</th>
          <th className="px-3 py-2 font-medium">{T.worker}</th>
          <th className="px-3 py-2 font-medium hidden md:table-cell">{T.role}</th>
          <th className="px-3 py-2 font-medium">{T.hourType}</th>
          <th className="px-3 py-2 font-medium text-right">{T.hours}</th>
          <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">{T.rate}</th>
          <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">{T.coef}</th>
          <th className="px-3 py-2 font-medium text-right">{T.amount}</th>
        </tr>
      </thead>
      <tbody>
        {calc.rows.map((r) => (
          <tr key={r.key} className="border-b last:border-0">
            <td className="px-3 py-2">{L.projectName(r.projectId)}</td>
            <td className="px-3 py-2">{L.employeeName(r.employeeId)}</td>
            <td className="px-3 py-2 hidden md:table-cell text-muted-foreground">{L.roleName(r.projectRoleId) || T.noRole}</td>
            <td className="px-3 py-2">{L.hourTypeName(r.hourType)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r.hours}</td>
            <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{r.clientRate ?? "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{r.clientCoef ?? "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums font-medium">{r.amount === null ? <span className="text-warning">{T.missingRate(1)}</span> : money(r.amount, r.currency, lang)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t bg-muted/30 font-semibold">
          <td className="px-3 py-2" colSpan={4}>{T.total}</td>
          <td className="px-3 py-2 text-right tabular-nums">{totals.hours}</td>
          <td className="hidden sm:table-cell" colSpan={2} />
          <td className="px-3 py-2 text-right"><MoneyList byCurrency={totals.byCurrency} lang={lang} empty={money(0, cur, lang)} className="items-end" /></td>
        </tr>
      </tfoot>
    </table>
  ) : (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b bg-muted/50 text-left">
          <th className="px-3 py-2 font-medium">{view === "employee" ? T.worker : T.role}</th>
          <th className="px-3 py-2 font-medium text-right">{T.hours}</th>
          <th className="px-3 py-2 font-medium text-right">{T.amount}</th>
        </tr>
      </thead>
      <tbody>
        {breakdownRows(calc.rows, view).map((b) => (
          <tr key={String(b.key)} className="border-b last:border-0">
            <td className="px-3 py-2">{view === "employee" ? L.employeeName(b.key) : L.roleName(b.key) || T.noRole}</td>
            <td className="px-3 py-2 text-right tabular-nums">{b.hours}</td>
            <td className="px-3 py-2 text-right"><MoneyList byCurrency={b.amount} lang={lang} className="items-end" /></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t bg-muted/30 font-semibold">
          <td className="px-3 py-2">{T.total}</td>
          <td className="px-3 py-2 text-right tabular-nums">{totals.hours}</td>
          <td className="px-3 py-2 text-right"><MoneyList byCurrency={totals.byCurrency} lang={lang} empty={money(0, cur, lang)} className="items-end" /></td>
        </tr>
      </tfoot>
    </table>
  );

  const costRow = (c, action) => (
    <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{formatIsoDate(c.cost_date, lang)}</span>
      <span className="flex-1 min-w-0">
        <span className="block truncate">{c.description || c.category || "—"}</span>
        <span className="block text-xs text-muted-foreground truncate">{L.projectName(c.project_id)}{c.category ? ` · ${[c.category, c.subcategory].filter(Boolean).join(" / ")}` : ""}</span>
      </span>
      <span className="tabular-nums font-medium">{money(c.amount, c.currency, lang)}</span>
      {action}
    </li>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-x-2">
            {L.clientName(summary.client_id)}
            <span className="text-muted-foreground font-normal">· {summary.project_id ? L.projectName(summary.project_id) : T.allProjectsOfClient}</span>
          </DialogTitle>
          <DialogDescription>
            {formatIsoDate(summary.period_start, lang)} – {formatIsoDate(summary.period_end, lang)} · {summary.currency}
            {summary.notes ? ` · ${summary.notes}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <BillingStatusControl summary={summary} canManage={canManage} T={T} />
          <div className="flex items-center gap-2">
            <BillingExport T={T} lang={lang} getData={exportData} />
            {canManage && prep && !payments.length && (
              <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={() => setDeleting(true)}>
                <Trash2 className="w-3.5 h-3.5" />{T.deleteSummary}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={`${T.calculated} (${calc.frozen ? T.frozen : T.live})`} hint={T.kpiCalculatedHint}>{money(calc.amount, cur, lang)}</Stat>
          <Stat label={T.invoiced} hint={T.kpiInvoicedHint}>{balance.invoiced === null ? <span className="text-muted-foreground text-base">—</span> : money(balance.invoiced, balance.currency, lang)}</Stat>
          <Stat label={T.received} hint={T.kpiReceivedHint}>{money(balance.received, balance.currency, lang)}</Stat>
          {balance.invoiced !== null ? (
            <Stat label={T.outstanding} hint={T.kpiOutstandingHint}>{money(balance.outstanding, balance.currency, lang)}</Stat>
          ) : (
            <Stat label={T.estimatedUnpaid} hint={T.kpiEstimatedHint} tone="border-dashed">{money(balance.estimatedUnpaid, balance.currency, lang)}</Stat>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <PaymentStatusBadge status={balance.status} overdue={balance.overdue} T={T} />
          {balance.invoiced === null && <span>{T.kpiEstimatedHint}</span>}
        </div>

        {calc.frozen ? (
          <>
            {summary.calculated_at && <p className="text-xs text-muted-foreground">{T.frozenAt(formatDate(new Date(summary.calculated_at), "d.M.yyyy HH:mm", lang))}</p>}
            {calc.live?.differs && (
              <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{T.driftWarning(money(calc.live.amount, cur, lang))}
              </p>
            )}
          </>
        ) : (
          <p className="flex items-start gap-2 text-xs text-muted-foreground"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />{T.liveNote}</p>
        )}

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">{T.lines}</h3>
            <Tabs value={view} onValueChange={setView}>
              <TabsList>
                <TabsTrigger value="lines">{T.byLine}</TabsTrigger>
                <TabsTrigger value="employee">{T.byWorker}</TabsTrigger>
                <TabsTrigger value="role">{T.byRole}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="rounded-xl border overflow-x-auto">
            {calc.rows.length ? table : <p className="p-6 text-center text-sm text-muted-foreground">{T.noLines}</p>}
          </div>
          {totals.missingRate > 0 && <p className="text-xs text-warning">{T.missingRate(totals.missingRate)}</p>}
        </section>

        <section className="rounded-xl border p-4 space-y-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><Receipt className="w-4 h-4 text-primary" />{T.linkedCosts}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{T.costsNote}</p>
          </div>
          {linked.length ? (
            <>
              <ul className="divide-y">
                {linked.map((c) => costRow(c, canManage && prep ? (
                  <Button size="icon" variant="ghost" className="h-7 w-7" title={T.removeCost} aria-label={T.removeCost} onClick={() => unlink.mutate(c.id)} disabled={unlink.isPending}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                ) : null))}
              </ul>
              <div className="flex justify-end gap-2 text-sm font-semibold"><span>{T.total}:</span><MoneyList byCurrency={costTotals(linked)} lang={lang} className="items-end" /></div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{T.noBillable}</p>
          )}
          {prep && candidates.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">{T.candidates}</p>
              <ul className="divide-y">
                {candidates.map((c) => costRow(c, canManage ? (
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => link.mutate(c.id)} disabled={link.isPending}>
                    <Plus className="w-3.5 h-3.5" />{T.addCost}
                  </Button>
                ) : null))}
              </ul>
            </div>
          )}
          {!prep && <p className="text-xs text-muted-foreground">{T.costsLocked}</p>}
        </section>

        <ExternalInvoiceForm key={`${summary.id}-${summary.updated_date}`} summary={summary} canManage={canManage} T={T} lang={lang} />

        <section className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" />{T.paymentsTitle}</h3>
            {canManage && (
              <Button size="sm" className="gap-1.5" onClick={() => setPaying(true)} disabled={balance.outstanding !== null && balance.outstanding <= 0}>
                <Plus className="w-3.5 h-3.5" />{T.addPayment}
              </Button>
            )}
          </div>
          {payments.length ? (
            <ul className="divide-y">
              {payments.map((p) => (
                <li key={p.id} className={`flex flex-wrap items-center gap-3 py-2 text-sm ${p.voided_at ? "opacity-60" : ""}`}>
                  <span className="w-24 shrink-0 text-muted-foreground">{formatIsoDate(p.payment_date, lang)}</span>
                  <span className="flex-1 min-w-0">
                    <span className={`block truncate ${p.voided_at ? "line-through" : ""}`}>{p.reference || "—"}{p.ext_invoice_reference ? ` · ${p.ext_invoice_reference}` : ""}</span>
                    {p.voided_at && <span className="block text-xs text-destructive">{T.voided}: {p.void_reason}{staff.name(p.voided_by) ? ` · ${staff.name(p.voided_by)}` : ""}</span>}
                    {staff.name(p.recorded_by) && <span className="block text-xs text-muted-foreground">{tr("Recorded by", "Evidentirao", "Zaevidoval")}: {staff.name(p.recorded_by)}</span>}
                    {p.notes && !p.voided_at && <span className="block text-xs text-muted-foreground truncate">{p.notes}</span>}
                  </span>
                  <span className={`tabular-nums font-medium ${p.voided_at ? "line-through" : ""}`}>{money(p.amount, p.currency, lang)}</span>
                  {canManage && !p.voided_at && (
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive" onClick={() => setVoiding(p)}>
                      <Ban className="w-3.5 h-3.5" />{T.voidPayment}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{T.noPayments}</p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2"><History className="w-4 h-4 text-muted-foreground" />{T.history}</h3>
          {history.data?.length ? (
            <ol className="space-y-1.5 text-sm">
              {history.data.map((h) => (
                <li key={h.id} className="flex flex-wrap gap-x-2">
                  <span className="font-medium">{T.statuses[h.from_status] || "—"} → {T.statuses[h.to_status]}</span>
                  <span className="text-muted-foreground">{T.changedBy(who(h), formatDate(new Date(h.changed_at), "d.M.yyyy HH:mm", lang))}</span>
                  {h.note && <span className="text-muted-foreground italic">„{h.note}"</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">{history.isLoading ? "…" : T.noHistory}</p>
          )}
        </section>

        <ClientPaymentDialog open={paying} onOpenChange={setPaying} summary={summary} balance={balance} T={T} lang={lang} />
        <VoidPaymentDialog payment={voiding} onOpenChange={(o) => !o && setVoiding(null)} T={T} lang={lang} />
        <ConfirmDeleteDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={() => remove.mutate()} message={T.deleteConfirm} />
      </DialogContent>
    </Dialog>
  );
}
