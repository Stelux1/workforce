// Mesečni obračun (Faza 3, D17) — isti izgled kao nekadašnji „Nedeljni obračun" (D12), mesec umesto nedelje.
// Tok: zaključaj mesec → unesi kurs EUR/RSD → Generiši obračun (nacrt, može ponovo) → Odobri → Označi kao isplaćeno.
// Novac računa samo src/lib/payroll (payrollMonth.js → computeWorkerMonth); baza čuva nacrt atomski
// (save_payroll_draft), proverava ga pre odobravanja (payroll_run_problems) i čuva odobren obračun nepromenljivim.
import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { addMonths, format, parseISO, startOfMonth } from "date-fns";
import {
  AlertTriangle, Banknote, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Lock, RefreshCw, Trash2, Unlock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import StatusBadge from "@/components/shared/StatusBadge";
import PageHeader from "@/components/shared/PageHeader";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate } from "@/lib/dateFormat";
import { parseCoef } from "@/lib/coefficientInput";
import { paramsFromRow, paramsRowForMonth } from "@/lib/payroll/params";
import {
  buildMonthPayroll, collectMonth, draftPayload, monthStart, payrollTotals, problemMessage, projectTotals, staleEmployees,
  timesheetWeekRange, warningLabel,
} from "@/lib/payroll/payrollMonth";

const eur = (n) => (n === null || n === undefined ? "—" : `€${Number(n).toFixed(2)}`);
const hrs = (n) => `${Number(n || 0).toFixed(1)}h`;
// Kurs se unosi kao „117,2" ili „117.2"; prazno/0/tekst = nema kursa (D2: bez podrazumevanog kursa).
const parseRate = (text) => parseCoef(text).value;
const currentMonth = () => format(startOfMonth(new Date()), "yyyy-MM-dd");

function useMonthParam() {
  const [params, setParams] = useSearchParams();
  let month;
  try {
    month = params.get("month") ? monthStart(params.get("month")) : currentMonth();
  } catch {
    month = currentMonth();
  }
  const setMonth = (m) => {
    const next = new URLSearchParams(params);
    if (m === currentMonth()) next.delete("month");
    else next.set("month", m.slice(0, 7));
    setParams(next, { replace: true });
  };
  return [month, setMonth];
}

function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel }) {
  const t = useT();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>{t("No")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function MonthlyPayroll() {
  const t = useT();
  const { lang } = useLang();
  const L = (en, sr) => (lang === "rs" ? sr : en);
  const queryClient = useQueryClient();
  const [month, setMonth] = useMonthParam();
  const monthDate = parseISO(month);
  const monthLabel = formatDate(monthDate, "LLLL yyyy", lang).replace(/^./, (c) => c.toUpperCase());
  const range = timesheetWeekRange(month);

  // ───── podaci ─────
  const runQ = useQuery({
    queryKey: ["payroll-run", month],
    queryFn: async () => (await base44.entities.PayrollRun.filter({ month }))[0] || null,
  });
  const run = runQ.data || null;
  const slipsQ = useQuery({
    queryKey: ["payslips", run?.id],
    queryFn: () => base44.entities.Payslip.filter({ run_id: run.id }),
    enabled: Boolean(run?.id),
  });
  const slipIds = (slipsQ.data || []).map((s) => s.id);
  const slipProjectsQ = useQuery({
    queryKey: ["payslip-projects", run?.id, slipIds.join(",")],
    queryFn: () => base44.entities.PayslipProject.filter({ payslip_id: slipIds }),
    enabled: slipIds.length > 0,
  });
  const lockQ = useQuery({
    queryKey: ["month-lock", month],
    queryFn: () => base44.entities.MonthLock.filter({ month }),
  });
  // Samo odobrene satnice ulaze u obračun; nedelje koje počinju do 6 dana pre meseca zalaze u njega.
  const timesheetsQ = useQuery({
    queryKey: ["timesheets", "payroll-month", month],
    queryFn: () => base44.entities.Timesheet.filter({ approval_status: "approved", week_start: { $gte: range.from, $lte: range.to } }),
  });
  const employeesQ = useQuery({ queryKey: ["employees", "payroll-month"], queryFn: () => base44.entities.Employee.list() });
  const historyQ = useQuery({ queryKey: ["employment-history", "payroll-month"], queryFn: () => base44.entities.EmploymentHistory.list() });
  const paramsQ = useQuery({ queryKey: ["payroll-params"], queryFn: () => base44.entities.PayrollParams.list() });
  const projectsQ = useQuery({ queryKey: ["projects", "payroll-month"], queryFn: () => base44.entities.Project.list() });
  const dbProblemsQ = useQuery({
    queryKey: ["payroll-run-problems", run?.id, run?.updated_date, slipIds.join(",")],
    queryFn: () => base44.rpc("payroll_run_problems", { p_run: run.id }),
    enabled: Boolean(run?.id) && run?.status === "draft",
  });

  const locked = (lockQ.data || []).length > 0;
  const timesheets = timesheetsQ.data || [];
  const employees = employeesQ.data || [];
  const history = historyQ.data || [];
  const projects = projectsQ.data || [];
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const vendorName = useMemo(() => new Map(history.filter((h) => h.vendor_id).map((h) => [h.vendor_id, h.vendor_name])), [history]);

  // Kurs: iz obračuna ako postoji, inače prazno — nikad podrazumevani kurs (D2).
  const [rateText, setRateText] = useState("");
  useEffect(() => {
    setRateText(run?.eur_rsd_rate ? String(Number(run.eur_rsd_rate)) : "");
  }, [month, run?.id, run?.eur_rsd_rate]);
  const rate = parseRate(rateText);
  const rateInvalid = rateText.trim() !== "" && rate === null;

  // Problemi se vide odmah (ne treba kurs): satnica bez snimka, koeficijent koji fali, radnik bez angažmana.
  const collected = useMemo(
    () => collectMonth({ month, timesheets, employees, employmentHistory: history, projects }),
    [month, timesheets, employees, history, projects]
  );

  // Sačuvani listići sa raspodelom po projektima.
  const stored = useMemo(() => {
    const byslip = new Map();
    for (const p of slipProjectsQ.data || []) {
      if (!byslip.has(p.payslip_id)) byslip.set(p.payslip_id, []);
      byslip.get(p.payslip_id).push(p);
    }
    return (slipsQ.data || [])
      .map((s) => ({ ...s, projects: (byslip.get(s.id) || []).sort((a, b) => String(a.project_id).localeCompare(String(b.project_id))) }))
      .sort((a, b) => String(a.employee_name || "").localeCompare(String(b.employee_name || ""), "sr"));
  }, [slipsQ.data, slipProjectsQ.data]);

  // Da li nacrt i dalje odgovara podacima (isti kurs i parametri kao u nacrtu, trenutne satnice i profili).
  const stale = useMemo(() => {
    if (!run || run.status !== "draft" || slipsQ.isLoading || slipProjectsQ.isLoading) return [];
    try {
      const live = buildMonthPayroll({
        month, eurRsdRate: Number(run.eur_rsd_rate), params: paramsFromRow(run.params), timesheets, employees, employmentHistory: history, projects,
      });
      return staleEmployees(stored, live.payslips);
    } catch {
      return [];
    }
  }, [run, stored, month, timesheets, employees, history, projects, slipsQ.isLoading, slipProjectsQ.isLoading]);

  const totals = payrollTotals(stored);
  const byProject = projectTotals(stored);
  const dbProblems = dbProblemsQ.data || [];
  const rateChanged = run && rate !== null && Number(run.eur_rsd_rate) !== rate;
  const canApprove = run?.status === "draft" && stored.length > 0 && collected.problems.length === 0 && dbProblems.length === 0
    && stale.length === 0 && !rateChanged && !dbProblemsQ.isLoading;

  // ───── radnje ─────
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null); // "approve" | "paid" | "delete"
  const [expanded, setExpanded] = useState({});
  const refresh = ({ skipProblems = false } = {}) => {
    const keys = [["payroll-run", month], ["payslips"], ["payslip-projects"], ["month-lock", month]];
    if (!skipProblems) keys.push(["payroll-run-problems"]);
    for (const key of keys) queryClient.invalidateQueries({ queryKey: key });
  };
  const act = async (name, fn, success, refreshOptions) => {
    setBusy(name);
    try {
      await fn();
      if (success) toast.success(success);
    } catch (e) {
      toast.error(e.message, { duration: 12000 });
    } finally {
      setBusy(null);
      refresh(refreshOptions);
    }
  };

  const lockMonth = () => act("lock", () => base44.rpc("lock_month", { p_month: month }), L("Month locked", "Mesec je zaključan"));
  const unlockMonth = () => act("unlock", () => base44.rpc("unlock_month", { p_month: month }), L("Month unlocked", "Mesec je otključan"));

  const generate = async () => {
    if (rate === null) {
      toast.error(L("Enter the EUR/RSD exchange rate for the month — no payroll without a rate.",
        "Unesite kurs EUR/RSD za mesec — bez kursa nema obračuna."));
      return;
    }
    if (!locked) {
      toast.error(L("Lock the month first — payroll is made only for a locked month.",
        "Prvo zaključajte mesec — obračun se pravi samo za zaključan mesec."));
      return;
    }
    if (run && run.status !== "draft") {
      toast.error(L("An approved payroll can't be generated again.", "Odobren obračun ne može ponovo da se generiše."));
      return;
    }
    await act("generate", async () => {
      // Sveži podaci pre računanja: satnice, radnici, angažmani, parametri i projekti.
      const results = await Promise.all([timesheetsQ, employeesQ, historyQ, paramsQ, projectsQ].map((q) => q.refetch()));
      const failed = results.find((r) => r.error);
      if (failed) throw failed.error;
      const [ts, emps, hist, prms, prjs] = results.map((r) => r.data || []);
      const paramsRow = paramsRowForMonth(prms, month);
      const result = buildMonthPayroll({
        month, eurRsdRate: rate, params: paramsFromRow(paramsRow), timesheets: ts, employees: emps, employmentHistory: hist, projects: prjs,
      });
      await base44.rpc("save_payroll_draft", { p_month: month, p_eur_rsd_rate: rate, p_params: paramsRow, p_payslips: draftPayload(result) });
      toast.success(L(`Draft saved — payslips: ${result.payslips.length}`, `Nacrt je sačuvan — platnih listića: ${result.payslips.length}`));
      if (result.problems.length) {
        const names = [...new Set(result.problems.map((p) => p.employeeName))];
        toast.warning(L(`Without a payslip (see the list of problems): ${names.join(", ")}`,
          `Bez platnog listića (vidite spisak problema): ${names.join(", ")}`), { duration: 12000 });
      }
    });
  };

  const approve = () => act("approve", () => base44.rpc("approve_payroll_run", { p_run: run.id }), L("Payroll approved", "Obračun je odobren"));
  const markPaid = () => act("paid", () => base44.rpc("mark_payroll_paid", { p_run: run.id }), L("Payroll marked as paid", "Obračun je označen kao isplaćen"));
  const deleteDraft = () => act("delete", async () => {
    const id = run.id;
    await base44.entities.PayrollRun.delete(id);
    // Obrisan nacrt se više ne proverava u bazi (inače greška „Obračun ne postoji").
    queryClient.setQueryData(["payroll-run", month], null);
    queryClient.removeQueries({ queryKey: ["payroll-run-problems", id] });
  }, L("Draft deleted", "Nacrt je obrisan"), { skipProblems: true });

  const engagementLabel = (s) =>
    s.engagement_type === "subcontractor_worker"
      ? `${t("Subcontractor")}${vendorName.get(s.vendor_id) ? ` · ${vendorName.get(s.vendor_id)}` : ""}`
      : t("Employee (direct)");
  const allocationOk = totals.allocated === totals.totalCost;

  return (
    <div className="space-y-6">
      <PageHeader title={t("Monthly Payroll")} subtitle={t("Net, gross, taxes, contributions and cost per project for the month")} />

      {/* Month Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="icon" aria-label={L("Previous month", "Prethodni mesec")}
          onClick={() => setMonth(format(addMonths(monthDate, -1), "yyyy-MM-dd"))}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-sm font-medium min-w-[160px] text-center" data-testid="payroll-month">{monthLabel}</span>
        <Button variant="outline" size="icon" aria-label={L("Next month", "Sledeći mesec")}
          onClick={() => setMonth(format(addMonths(monthDate, 1), "yyyy-MM-dd"))}><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonth())}>{t("This Month")}</Button>
        <Button variant="outline" size="sm" className="gap-2 ml-auto" onClick={generate}
          disabled={busy !== null || (run && run.status !== "draft")}>
          <RefreshCw className={`w-4 h-4 ${busy === "generate" ? "animate-spin" : ""}`} /> {t("Generate Payroll")}
        </Button>
      </div>

      {/* Kurs, zaključavanje i status obračuna */}
      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-3 md:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="eur-rsd-rate">{t("EUR/RSD exchange rate")}</Label>
            <Input id="eur-rsd-rate" inputMode="decimal" value={rateText} onChange={(e) => setRateText(e.target.value)}
              placeholder={L("e.g. 117.20", "npr. 117,20")} disabled={run && run.status !== "draft"}
              aria-invalid={rateInvalid || rate === null}
              className={rateInvalid ? "border-red-500 bg-red-50 text-red-700 focus-visible:ring-red-500" : ""} />
            <p className={`text-xs ${rate === null ? "text-red-600" : "text-muted-foreground"}`}>
              {rate === null ? t("No payroll without an exchange rate") : t("1 EUR in RSD, entered by the admin for this month")}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{locked ? t("Month locked") : t("Month not locked")}</p>
            {locked ? (
              <Button variant="outline" size="sm" className="gap-2" onClick={unlockMonth} disabled={busy !== null || Boolean(run)}
                title={run ? L("Delete the draft payroll first", "Prvo obrišite nacrt obračuna") : undefined}>
                <Unlock className="w-4 h-4" /> {t("Unlock Month")}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="gap-2" onClick={lockMonth} disabled={busy !== null}>
                <Lock className="w-4 h-4" /> {t("Lock Month")}
              </Button>
            )}
            <p className="text-xs text-muted-foreground">{t("A locked month's timesheets can't be changed")}</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              {t("Status")}: {run ? <StatusBadge status={run.status} /> : <span className="text-muted-foreground font-normal">{t("No payroll yet")}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {run?.status === "draft" && (
                <>
                  <Button size="sm" className="gap-2" onClick={() => setConfirm("approve")} disabled={busy !== null || !canApprove}>
                    <CheckCircle2 className="w-4 h-4" /> {t("Approve Payroll")}
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-2 text-destructive" onClick={() => setConfirm("delete")} disabled={busy !== null}>
                    <Trash2 className="w-4 h-4" /> {t("Delete Draft")}
                  </Button>
                </>
              )}
              {run?.status === "approved" && (
                <Button size="sm" className="gap-2" onClick={() => setConfirm("paid")} disabled={busy !== null}>
                  <Banknote className="w-4 h-4" /> {t("Mark as Paid")}
                </Button>
              )}
            </div>
            {run?.status === "draft" && rateChanged && (
              <p className="text-xs text-amber-700">{t("The exchange rate was changed — generate the payroll again")}</p>
            )}
          </div>
        </div>
      </Card>

      {/* Šta blokira obračun */}
      {(collected.problems.length > 0 || dbProblems.length > 0 || stale.length > 0) && (
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20" data-testid="payroll-problems">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-4 h-4" /> {t("What blocks the payroll")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {collected.problems.length > 0 && (
              <ul className="list-disc pl-5 space-y-1">
                {collected.problems.map((p, i) => <li key={`p${i}`}>{problemMessage(p, lang)}</li>)}
              </ul>
            )}
            {stale.length > 0 && (
              <p className="text-amber-800">
                {L(`The draft no longer matches the data for: ${stale.join(", ")} — click Generate Payroll.`,
                  `Nacrt više ne odgovara podacima za: ${stale.join(", ")} — kliknite Generiši obračun.`)}
              </p>
            )}
            {dbProblems.length > 0 && (
              <div>
                <p className="font-medium">{t("Database check")}:</p>
                <ul className="list-disc pl-5 space-y-1">{dbProblems.map((m, i) => <li key={`d${i}`}>{m}</li>)}</ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly Summary */}
      {stored.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t("Total Hours"), value: hrs(totals.hours) },
            { label: t("To pay"), value: eur(totals.payout) },
            { label: t("Gross 2 (labour cost)"), value: eur(totals.totalCost) },
            { label: t("Client Revenue"), value: eur(totals.revenue) },
          ].map((item) => (
            <Card key={item.label} className="p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-xl font-bold mt-1">{item.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Payslips Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("Payslips")}</CardTitle>
        </CardHeader>
        <CardContent>
          {stored.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground text-sm">{t("No payroll for this month")}</p>
              <p className="text-muted-foreground text-xs mt-1">{t("Lock the month, enter the exchange rate, then click Generate Payroll")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="payslips-table">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4">{t("Employee")}</th>
                    <th className="text-left py-2 pr-4">{t("Engagement")}</th>
                    <th className="text-right py-2 pr-4">{t("Hours")}</th>
                    <th className="text-right py-2 pr-4">{t("Net")}</th>
                    <th className="text-right py-2 pr-4">{t("Tax")}</th>
                    <th className="text-right py-2 pr-4">{t("Employee contributions")}</th>
                    <th className="text-right py-2 pr-4">{t("Gross")}</th>
                    <th className="text-right py-2 pr-4">{t("Employer contributions")}</th>
                    <th className="text-right py-2 pr-4">{t("Gross 2 (labour cost)")}</th>
                    <th className="text-right py-2">{t("To pay")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stored.map((s) => {
                    const empContrib = s.emp_pio === null ? null : Number(s.emp_pio) + Number(s.emp_health) + Number(s.emp_unemployment);
                    const erContrib = s.er_pio === null ? null : Number(s.er_pio) + Number(s.er_health);
                    const open = Boolean(expanded[s.id]);
                    return (
                      <Fragment key={s.id}>
                        <tr className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setExpanded((e) => ({ ...e, [s.id]: !open }))}>
                          <td className="py-3 pr-4 font-medium">
                            <span className="inline-flex items-center gap-1">
                              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
                              {s.employee_name}
                            </span>
                            {(s.warnings || []).map((w) => (
                              <p key={w} className="text-xs font-normal text-amber-700 mt-0.5">{warningLabel(w, lang)}</p>
                            ))}
                          </td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground">{engagementLabel(s)}</td>
                          <td className="py-3 pr-4 text-right">{hrs(s.total_hours)}</td>
                          <td className="py-3 pr-4 text-right">{eur(s.neto)}</td>
                          <td className="py-3 pr-4 text-right">{eur(s.tax)}</td>
                          <td className="py-3 pr-4 text-right">{eur(empContrib)}</td>
                          <td className="py-3 pr-4 text-right">{eur(s.bruto)}</td>
                          <td className="py-3 pr-4 text-right">{eur(erContrib)}</td>
                          <td className="py-3 pr-4 text-right font-medium">{eur(s.total_cost)}</td>
                          <td className="py-3 text-right text-emerald-600 font-medium">{eur(s.payout)}</td>
                        </tr>
                        {open && s.projects.map((p) => (
                          <tr key={`${s.id}-${p.project_id}`} className="bg-muted/20 text-xs text-muted-foreground">
                            <td className="py-2 pr-4 pl-6" colSpan={2}>{projectName.get(p.project_id) || p.project_id}</td>
                            <td className="py-2 pr-4 text-right">{hrs(p.hours)}</td>
                            <td className="py-2 pr-4 text-right" colSpan={5}>{t("Worker earnings")}: {eur(p.worker_amount)} · {t("Client Revenue")}: {eur(p.revenue)}</td>
                            <td className="py-2 pr-4 text-right">{eur(p.labor_cost)}</td>
                            <td />
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="py-3 pr-4" colSpan={2}>{t("Total")}</td>
                    <td className="py-3 pr-4 text-right">{hrs(totals.hours)}</td>
                    <td className="py-3 pr-4 text-right">{eur(totals.neto)}</td>
                    <td className="py-3 pr-4 text-right">{eur(totals.tax)}</td>
                    <td className="py-3 pr-4 text-right">{eur(totals.employeeContributions)}</td>
                    <td className="py-3 pr-4 text-right">{eur(totals.bruto)}</td>
                    <td className="py-3 pr-4 text-right">{eur(totals.employerContributions)}</td>
                    <td className="py-3 pr-4 text-right">{eur(totals.totalCost)}</td>
                    <td className="py-3 text-right">{eur(totals.payout)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Raspodela po projektima */}
      {stored.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("Cost per project")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="projects-table">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4">{t("Project")}</th>
                    <th className="text-right py-2 pr-4">{t("Hours")}</th>
                    <th className="text-right py-2 pr-4">{t("Worker earnings")}</th>
                    <th className="text-right py-2 pr-4">{t("Labour cost")}</th>
                    <th className="text-right py-2 pr-4">{t("Client Revenue")}</th>
                    <th className="text-right py-2">{t("Difference")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {byProject.map((p) => (
                    <tr key={p.project_id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 font-medium">{projectName.get(p.project_id) || p.project_id}</td>
                      <td className="py-3 pr-4 text-right">{hrs(p.hours)}</td>
                      <td className="py-3 pr-4 text-right">{eur(p.worker_amount)}</td>
                      <td className="py-3 pr-4 text-right">{eur(p.labor_cost)}</td>
                      <td className="py-3 pr-4 text-right">{eur(p.revenue)}</td>
                      <td className={`py-3 text-right font-medium ${p.difference < 0 ? "text-red-600" : "text-emerald-600"}`}>{eur(p.difference)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="py-3 pr-4">{t("Total")}</td>
                    <td className="py-3 pr-4 text-right">{hrs(totals.hours)}</td>
                    <td className="py-3 pr-4 text-right">{eur(totals.basis)}</td>
                    <td className="py-3 pr-4 text-right">{eur(totals.allocated)}</td>
                    <td className="py-3 pr-4 text-right">{eur(totals.revenue)}</td>
                    <td className="py-3 text-right">{eur(totals.difference)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className={`text-xs mt-3 ${allocationOk ? "text-muted-foreground" : "text-red-600 font-medium"}`} data-testid="allocation-check">
              {allocationOk
                ? L(`Sum of cost per project ${eur(totals.allocated)} = sum of gross 2 ${eur(totals.totalCost)}. Project costs (materials etc.) are not included.`,
                  `Zbir troška po projektima ${eur(totals.allocated)} = zbir bruto 2 ${eur(totals.totalCost)}. Ostali troškovi projekta (materijal i sl.) nisu uključeni.`)
                : L(`Sum of cost per project ${eur(totals.allocated)} ≠ sum of gross 2 ${eur(totals.totalCost)}`,
                  `Zbir troška po projektima ${eur(totals.allocated)} ≠ zbir bruto 2 ${eur(totals.totalCost)}`)}
            </p>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirm === "approve"} onClose={() => setConfirm(null)} onConfirm={approve} confirmLabel={t("Approve Payroll")}
        title={L(`Approve the payroll for ${monthLabel}?`, `Odobriti obračun za ${monthLabel}?`)}
        message={L("An approved payroll can't be changed or deleted, and the month can't be unlocked.",
          "Odobren obračun više ne može da se menja ni briše, a mesec ne može da se otključa.")}
      />
      <ConfirmDialog
        open={confirm === "paid"} onClose={() => setConfirm(null)} onConfirm={markPaid} confirmLabel={t("Mark as Paid")}
        title={L(`Mark the payroll for ${monthLabel} as paid?`, `Označiti obračun za ${monthLabel} kao isplaćen?`)}
        message={L(`Total to pay: ${eur(totals.payout)}. This can't be undone.`, `Ukupno za isplatu: ${eur(totals.payout)}. Ovo ne može da se poništi.`)}
      />
      <ConfirmDeleteDialog
        open={confirm === "delete"} onClose={() => setConfirm(null)} onConfirm={deleteDraft}
        message={L("The draft payroll and its payslips will be deleted. You can generate it again.",
          "Nacrt obračuna i njegovi platni listići biće obrisani. Možete ga ponovo generisati.")}
      />
    </div>
  );
}
