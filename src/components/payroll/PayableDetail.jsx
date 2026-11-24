// Detalj obaveze (spec §7): obračunato iz odobrenih sati sa razradom po radniku (T12), korekcije sa razlogom,
// isplate (više po obavezi, storno umesto izmene), Calculated / Paid / Remaining / Due i status.
// Za direktnog radnika: poređenje sa iznosom za isplatu iz srpskog mesečnog obračuna (razlika → korekcija).
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, CheckCircle2, ExternalLink, Plus, Trash2, Undo2, Wallet } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useStaffDirectory } from "@/hooks/useStaffDirectory";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { netComparison, periodMonth, workerBreakdown } from "@/lib/payroll/payablesList";
import AdjustmentDialog from "./AdjustmentDialog";
import PaymentDialog from "./PaymentDialog";
import VoidPaymentDialog from "./VoidPaymentDialog";
import { DueBadge, PayableStatusBadge, invalidatePayables, isoDate, money, periodText, personName } from "./payablesShared";

function Amount({ label, value, currency, lang, strong, tone }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 tabular-nums ${strong ? "text-base font-semibold" : "text-sm font-medium"} ${tone || ""}`}>{money(value, currency, lang)}</p>
    </div>
  );
}

function Section({ title, hint, action, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function PayableDetail({ row, open, onOpenChange, T, lang, canManage, canRecord, employees, projects }) {
  const queryClient = useQueryClient();
  const staff = useStaffDirectory({ enabled: open });
  const [payOpen, setPayOpen] = useState(false);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adjPreset, setAdjPreset] = useState({ amount: null, reason: "" });
  const [voiding, setVoiding] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // 'confirm' | 'cancel' | 'delete'

  const month = row ? periodMonth(row.payable) : null;
  const wantsNet = Boolean(row && row.payeeType === "employee" && month);
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ["payables", "net", "runs", month],
    queryFn: () => base44.entities.PayrollRun.filter({ month }),
    enabled: open && wantsNet,
  });
  const runIds = runs.map((r) => r.id);
  const { data: payslips = [], isLoading: slipsLoading } = useQuery({
    queryKey: ["payables", "net", "slips", runIds.join(","), row?.payeeId],
    queryFn: () => base44.entities.Payslip.filter({ run_id: runIds, employee_id: row.payeeId }),
    enabled: open && wantsNet && runIds.length > 0,
  });

  const act = useMutation({
    mutationFn: (kind) => (kind === "delete"
      ? base44.entities.Payable.delete(row.id)
      : base44.entities.Payable.update(row.id, { status: kind === "confirm" ? "confirmed" : "cancelled" })),
    onSuccess: (_, kind) => {
      invalidatePayables(queryClient);
      toast.success(kind === "confirm" ? T.confirmedMsg : kind === "cancel" ? T.cancelledMsg : T.deletedMsg);
      if (kind === "delete") onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (!row) return null;
  const cur = row.currency;
  const p = row.payable;
  const isDraft = p.status === "draft";
  const isConfirmed = p.status === "confirmed";
  const empById = new Map((employees || []).map((e) => [e.id, e]));
  const projectName = (id) => (projects || []).find((x) => x.id === id)?.name || T.noProject;
  // Imena osoblja iz staff_directory() (id, ime, uloga) — vidljiva svakom osoblju, ne samo uz users.manage.
  const userName = staff.name;
  const join = (...parts) => parts.filter(Boolean).join(" · ");
  const workers = workerBreakdown(row, employees);
  const net = wantsNet && !runsLoading && !slipsLoading ? netComparison(row, { runs, payslips }) : null;
  const hasActivePayments = row.balance.paymentCount > 0;

  const dialogs = {
    confirm: { title: T.confirmTitle, body: T.confirmBody, label: T.confirm },
    cancel: { title: T.cancelTitle, body: T.cancelBody, label: T.cancel },
    delete: { title: T.deleteTitle, body: T.deleteBody, label: T.deleteDraft },
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto space-y-5">
          <SheetHeader className="text-left space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <SheetTitle className="text-lg">{row.payeeName || T.unknownPayee}</SheetTitle>
              <PayableStatusBadge status={row.status} T={T} />
              {isConfirmed && <DueBadge state={row.balance.overdue ? "overdue" : null} T={T} />}
            </div>
            <SheetDescription>
              {row.payeeType === "vendor" ? T.payeeVendor : T.payeeEmployee} · {T.periodLabel}: {periodText(row.periodStart, row.periodEnd, lang)}
              {" · "}{T.due}: {row.dueDate ? isoDate(row.dueDate, lang) : T.noDueDate}
            </SheetDescription>
          </SheetHeader>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Amount label={T.calculated} value={p.calculated_amount} currency={cur} lang={lang} />
            <Amount label={T.adjustments} value={p.adjustments_amount} currency={cur} lang={lang} />
            <Amount label={T.total} value={row.balance.total} currency={cur} lang={lang} strong />
            <Amount label={T.paid} value={row.balance.paid} currency={cur} lang={lang} tone="text-success" />
            <Amount label={T.remaining} value={isConfirmed ? row.balance.remaining : row.balance.total} currency={cur} lang={lang} strong
              tone={isConfirmed && row.balance.remaining > 0 ? (row.balance.overdue ? "text-destructive" : "text-warning") : ""} />
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">{T.hours}</p>
              <p className="mt-0.5 text-sm font-medium tabular-nums">{row.hours.toFixed(2)} h · {row.workerCount} {T.workers.toLowerCase()}</p>
            </div>
          </div>

          {isDraft && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{T.draftNote}</p>}
          {p.status === "cancelled" && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{T.cancelledNote}</p>}
          {isConfirmed && p.confirmed_at && (
            <p className="text-xs text-muted-foreground">{T.confirmedBy}: {join(isoDate(p.confirmed_at, lang), userName(p.confirmed_by))}</p>
          )}

          {(canManage || canRecord) && p.status !== "cancelled" && (
            <div className="flex flex-wrap gap-2">
              {canRecord && isConfirmed && row.balance.remaining > 0 && (
                <Button size="sm" className="gap-2" onClick={() => setPayOpen(true)}><Wallet className="w-4 h-4" />{T.recordPayment}</Button>
              )}
              {canManage && isDraft && (
                <Button size="sm" className="gap-2" onClick={() => setConfirmAction("confirm")} disabled={act.isPending}><CheckCircle2 className="w-4 h-4" />{T.confirm}</Button>
              )}
              {canManage && (
                <Button size="sm" variant="outline" className="gap-2" onClick={() => { setAdjPreset({ amount: null, reason: "" }); setAdjOpen(true); }}>
                  <Plus className="w-4 h-4" />{T.addAdjustment}
                </Button>
              )}
              {canManage && isDraft && (
                <Button size="sm" variant="ghost" className="gap-2 text-destructive" onClick={() => setConfirmAction("delete")} disabled={act.isPending}><Trash2 className="w-4 h-4" />{T.deleteDraft}</Button>
              )}
              {canManage && isConfirmed && !hasActivePayments && (
                <Button size="sm" variant="ghost" className="gap-2 text-destructive" onClick={() => setConfirmAction("cancel")} disabled={act.isPending}><Ban className="w-4 h-4" />{T.cancel}</Button>
              )}
            </div>
          )}

          <Section title={row.payeeType === "vendor" ? T.byWorker : T.labor} hint={T.laborHint}>
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{T.worker} / {T.project}</th>
                    <th className="px-3 py-2 text-right font-medium">{T.hours}</th>
                    <th className="px-3 py-2 text-right font-medium">{T.calculated}</th>
                    <th className="px-3 py-2 text-right font-medium">{T.adjustments}</th>
                    <th className="px-3 py-2 text-right font-medium">{T.total}</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">—</td></tr>
                  )}
                  {workers.map((w) => (
                    <tr key={w.employeeId || "all"} className="border-t align-top">
                      <td className="px-3 py-2">
                        <p className="font-medium">{w.employeeId ? personName(empById.get(w.employeeId)) : T.adjNoWorker}</p>
                        {w.projects.map((pr, i) => (
                          <p key={i} className="text-xs text-muted-foreground">{projectName(pr.projectId)} · {pr.hours.toFixed(2)} h · {money(pr.amount, cur, lang)}</p>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{w.hours ? w.hours.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(w.labor, cur, lang)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{w.adjustments ? money(w.adjustments, cur, lang) : "—"}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{money(w.total, cur, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {wantsNet && (
            <Section title={T.netTitle} hint={T.netHint}
              action={<Link to={`/payroll/monthly?month=${month.slice(0, 7)}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">{T.openMonthly}<ExternalLink className="w-3 h-3" /></Link>}>
              {runsLoading || slipsLoading ? (
                <div className="h-14 rounded-lg bg-muted animate-pulse" />
              ) : !net?.runStatus ? (
                <p className="text-sm text-muted-foreground">{T.netNoRun}</p>
              ) : net.payout === null ? (
                <p className="text-sm text-muted-foreground">{T.netNoSlip}</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 items-stretch">
                  <Amount label={T.total} value={net.payable} currency={cur} lang={lang} />
                  <Amount label={T.netPayout} value={net.payout} currency={cur} lang={lang} />
                  <div className="rounded-lg border bg-card p-3 flex flex-col justify-between gap-1">
                    <div>
                      <p className="text-xs text-muted-foreground">{T.netDiff}</p>
                      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${net.difference ? "text-warning" : "text-success"}`}>{money(net.difference, cur, lang)}</p>
                    </div>
                    {canManage && net.difference !== 0 && p.status !== "cancelled" && (row.balance.total - net.difference) >= row.balance.paid && (
                      <button type="button" className="text-left text-xs text-primary hover:underline"
                        onClick={() => { setAdjPreset({ amount: -net.difference, reason: `${T.netTitle}: ${money(net.payout, cur, lang)}` }); setAdjOpen(true); }}>
                        {T.addAdjustment}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </Section>
          )}

          <Section title={T.adjustmentsTitle}>
            {row.adjustmentLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">{T.noAdjustments}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {row.adjustmentLines.slice().sort((a, b) => String(a.created_date).localeCompare(String(b.created_date))).map((l) => (
                  <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="break-words">{l.reason}</p>
                      <p className="text-xs text-muted-foreground">
                        {join(isoDate(l.created_date, lang), userName(l.created_by), l.employee_id && personName(empById.get(l.employee_id)))}
                      </p>
                    </div>
                    <span className={`shrink-0 font-medium tabular-nums ${Number(l.amount) < 0 ? "text-destructive" : "text-success"}`}>
                      {Number(l.amount) > 0 ? "+" : ""}{money(l.amount, cur, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={T.paymentsTitle}>
            {row.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{T.noPayments}</p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {row.payments.map((m) => (
                  <li key={m.id} className={`flex items-start justify-between gap-3 px-3 py-2 text-sm ${m.voided_at ? "opacity-60" : ""}`}>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {isoDate(m.payment_date, lang)}{m.reference ? ` · ${m.reference}` : ""}
                        {m.voided_at && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{T.voided}</span>}
                      </p>
                      {m.description && <p className="text-xs text-muted-foreground break-words">{m.description}</p>}
                      <p className="text-xs text-muted-foreground">{T.recordedBy}: {join(isoDate(m.recorded_at, lang), userName(m.recorded_by))}</p>
                      {m.voided_at && <p className="text-xs text-muted-foreground break-words">{T.voidReason}: {join(m.void_reason, isoDate(m.voided_at, lang), userName(m.voided_by))}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`font-medium tabular-nums ${m.voided_at ? "line-through" : ""}`}>{money(m.amount, m.currency, lang)}</span>
                      {canRecord && !m.voided_at && (
                        <button type="button" className="inline-flex items-center gap-1 text-xs text-destructive hover:underline" onClick={() => setVoiding(m)}>
                          <Undo2 className="w-3 h-3" />{T.voidPayment}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </SheetContent>
      </Sheet>

      <PaymentDialog row={row} open={payOpen} onOpenChange={setPayOpen} T={T} lang={lang} />
      <AdjustmentDialog row={row} workers={workers.filter((w) => w.employeeId)} open={adjOpen} onOpenChange={setAdjOpen} T={T} lang={lang}
        initialAmount={adjPreset.amount} initialReason={adjPreset.reason} />
      <VoidPaymentDialog payment={voiding} open={Boolean(voiding)} onOpenChange={(o) => !o && setVoiding(null)} T={T} lang={lang} />
      <AlertDialog open={Boolean(confirmAction)} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogs[confirmAction]?.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogs[confirmAction]?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{T.back}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { act.mutate(confirmAction); setConfirmAction(null); }}>{dialogs[confirmAction]?.label}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
