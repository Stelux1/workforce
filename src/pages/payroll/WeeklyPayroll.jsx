import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format, startOfWeek, endOfWeek, addWeeks, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import StatusBadge from "@/components/shared/StatusBadge";
import PageHeader from "@/components/shared/PageHeader";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate, shortDatePattern, longDatePattern } from "@/lib/dateFormat";
import { round2 } from "@/lib/payroll/money";

export default function WeeklyPayroll() {
  const t = useT();
  const { lang } = useLang();
  const L = (en, sr) => (lang === "rs" ? sr : en);
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, "yyyy-MM-dd");
  const weekEndStr = format(weekEnd, "yyyy-MM-dd");

  // Odobrene satnice izabrane nedelje (ranije 500 redova sortiranih po nepostojećem polju „date").
  const { data: weekTimesheets = [] } = useQuery({
    queryKey: ["timesheets", "approved-week", weekStartStr],
    queryFn: () => base44.entities.Timesheet.filter({ week_start: weekStartStr, approval_status: "approved" }),
  });

  const { data: payrollRecords = [], isLoading } = useQuery({
    queryKey: ["payroll-records"],
    queryFn: () => base44.entities.PayrollRecord.list("-week_start"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PayrollRecord.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["payroll-records"] }); toast.success(t("Updated") || "Updated"); },
  });

  const weekPayroll = payrollRecords.filter((p) => p.week_start === weekStartStr);

  // Šta odobrene satnice SADA daju po radniku — osnova za pravljenje i osvežavanje obračuna (§9.1 #8).
  const byEmployee = {};
  weekTimesheets.forEach((ts) => {
    if (!byEmployee[ts.employee_id]) byEmployee[ts.employee_id] = { employee_name: ts.employee_name, hours: 0, ot: 0, cost: 0, revenue: 0, profit: 0 };
    const d = byEmployee[ts.employee_id];
    d.hours += ts.total_hours || 0;
    d.ot += ts.overtime_hours || 0;
    d.cost += ts.worker_cost || 0;
    d.revenue += ts.client_revenue || 0;
    d.profit += ts.profit || 0;
  });
  const recordFields = (data) => {
    const cost = round2(data.cost), revenue = round2(data.revenue), profit = round2(data.profit), hours = round2(data.hours);
    return {
      total_hours: hours,
      overtime_hours: round2(data.ot),
      b2c_rate: hours > 0 ? round2(cost / hours) : 0, // prosečna satnica radnika te nedelje (ne tarifa prvog reda)
      total_worker_cost: cost,
      total_client_revenue: revenue,
      total_profit: profit,
      profit_margin: revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0,
    };
  };
  const isStale = (rec) => {
    const cur = recordFields(byEmployee[rec.employee_id] || { hours: 0, ot: 0, cost: 0, revenue: 0, profit: 0 });
    return Number(rec.total_hours) !== cur.total_hours || Number(rec.total_worker_cost) !== cur.total_worker_cost
      || Number(rec.total_client_revenue) !== cur.total_client_revenue;
  };

  const [generating, setGenerating] = useState(false);
  const generatePayroll = async () => {
    if (Object.keys(byEmployee).length === 0 && weekPayroll.length === 0) {
      toast.error(L("No approved timesheets for this week", "Nema odobrenih satnica za ovu nedelju"));
      return;
    }
    setGenerating(true);
    let created = 0, refreshed = 0, unchanged = 0;
    const blocked = [];
    try {
      for (const [empId, data] of Object.entries(byEmployee)) {
        const rec = weekPayroll.find((p) => p.employee_id === empId);
        if (!rec) {
          await base44.entities.PayrollRecord.create({
            employee_id: empId, employee_name: data.employee_name, week_start: weekStartStr, week_end: weekEndStr,
            ...recordFields(data), payment_status: "pending", payment_due_date: format(addWeeks(weekEnd, 1), "yyyy-MM-dd"),
          });
          created++;
        } else if (!isStale(rec)) {
          unchanged++;
        } else if (rec.payment_status === "pending") {
          await base44.entities.PayrollRecord.update(rec.id, recordFields(data));
          refreshed++;
        } else {
          blocked.push(rec.employee_name);
        }
      }
      // Obračun na čekanju čiji radnik više nema odobrenih satnica te nedelje se svodi na 0 (ne briše se).
      for (const rec of weekPayroll) {
        if (byEmployee[rec.employee_id] || !isStale(rec)) continue;
        if (rec.payment_status === "pending") {
          await base44.entities.PayrollRecord.update(rec.id, recordFields({ hours: 0, ot: 0, cost: 0, revenue: 0, profit: 0 }));
          refreshed++;
        } else blocked.push(rec.employee_name);
      }
    } finally {
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ["payroll-records"] });
    }
    toast.success(L(`Payroll: ${created} created, ${refreshed} updated, ${unchanged} unchanged`,
      `Obračun: napravljeno ${created}, osveženo ${refreshed}, bez promene ${unchanged}`));
    if (blocked.length) {
      toast.warning(L(`Not updated (already approved/paid): ${blocked.join(", ")} — the approved timesheets now give a different amount; check manually.`,
        `Nije osveženo (već odobreno/isplaćeno): ${blocked.join(", ")} — odobrene satnice sada daju drugi iznos; proverite ručno.`), { duration: 12000 });
    }
  };

  const changeStatus = (rec, status) => {
    // Ne može se odobriti ili isplatiti obračun koji više ne odgovara odobrenim satnicama.
    if ((status === "approved" || status === "paid") && isStale(rec)) {
      toast.error(L("This payroll is out of date (timesheets changed). Click Generate payroll to refresh it first.",
        "Obračun je zastareo (satnice su menjane). Prvo kliknite Generiši obračun da se osveži."));
      return;
    }
    updateMutation.mutate({ id: rec.id, data: { payment_status: status } });
  };

  const totals = weekPayroll.reduce((acc, p) => ({
    hours: acc.hours + (p.total_hours || 0),
    cost: acc.cost + (p.total_worker_cost || 0),
    revenue: acc.revenue + (p.total_client_revenue || 0),
    profit: acc.profit + (p.total_profit || 0),
  }), { hours: 0, cost: 0, revenue: 0, profit: 0 });

  return (
    <div className="space-y-6">
      <PageHeader title={t("Weekly Payroll") || "Weekly Payroll"} subtitle={t("Manage weekly payment schedules") || "Manage weekly payment schedules"} />

      {/* Week Selector */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setWeekOffset(weekOffset - 1)}><ChevronLeft className="w-4 h-4" /></Button>
        <span className="text-sm font-medium min-w-[220px] text-center">
          {formatDate(weekStart, shortDatePattern(lang), lang)} – {formatDate(weekEnd, longDatePattern(lang), lang)}
        </span>
        <Button variant="outline" size="icon" onClick={() => setWeekOffset(weekOffset + 1)}><ChevronRight className="w-4 h-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>{t("This Week") || "This Week"}</Button>
        <Button variant="outline" size="sm" className="gap-2 ml-auto" onClick={generatePayroll} disabled={generating}>
          <RefreshCw className="w-4 h-4" /> {t("Generate Payroll") || "Generate Payroll"}
        </Button>
      </div>

      {/* Weekly Summary */}
      {weekPayroll.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
                { label: t("Total Hours") || "Total Hours", value: totals.hours.toFixed(1) + "h" },
                { label: t("Total Payroll Cost") || "Payroll Cost", value: "€" + totals.cost.toFixed(2) },
                { label: t("Total Client Revenue") || "Client Revenue", value: "€" + totals.revenue.toFixed(2) },
                { label: t("Net Profit") || "Net Profit", value: "€" + totals.profit.toFixed(2) },
              ].map((item) => (
            <Card key={item.label} className="p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-xl font-bold mt-1">{item.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Payroll Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("Payroll Records") || "Payroll Records"}</CardTitle>
        </CardHeader>
        <CardContent>
          {weekPayroll.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground text-sm">{t("No payroll records for this week") || "No payroll records for this week."}</p>
              <p className="text-muted-foreground text-xs mt-1">{t("Approve timesheets then click Generate Payroll") || "Approve timesheets then click \"Generate Payroll\"."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4">{t("Employee")}</th>
                    <th className="text-right py-2 pr-4">{t("Hours") || "Hours"}</th>
                    <th className="text-right py-2 pr-4">{t("Worker Cost") || "Worker Cost"}</th>
                    <th className="text-right py-2 pr-4">{t("Client Revenue") || "Client Revenue"}</th>
                    <th className="text-right py-2 pr-4">{t("Profit")}</th>
                    <th className="text-right py-2 pr-4">{t("Profit Margin") || "Margin"}</th>
                    <th className="text-right py-2 pr-4">{t("Due Date") || "Due Date"}</th>
                    <th className="text-right py-2">{t("Status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {weekPayroll.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pr-4 font-medium">{p.employee_name}</td>
                      <td className="py-3 pr-4 text-right">{p.total_hours?.toFixed(1)}h</td>
                      <td className="py-3 pr-4 text-right">€{(p.total_worker_cost || 0).toFixed(2)}</td>
                      <td className="py-3 pr-4 text-right">€{(p.total_client_revenue || 0).toFixed(2)}</td>
                      <td className="py-3 pr-4 text-right text-emerald-600 font-medium">€{(p.total_profit || 0).toFixed(2)}</td>
                      <td className="py-3 pr-4 text-right">{p.profit_margin?.toFixed(1)}%</td>
                      <td className="py-3 pr-4 text-right text-muted-foreground text-xs">{p.payment_due_date && formatDate(parseISO(p.payment_due_date), shortDatePattern(lang), lang)}</td>
                      <td className="py-3 text-right">
                        <Select value={p.payment_status} onValueChange={(v) => changeStatus(p, v)}>
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                             <SelectItem value="pending">{t("Pending") || "Pending"}</SelectItem>
                             <SelectItem value="approved">{t("Approved") || "Approved"}</SelectItem>
                             <SelectItem value="paid">{t("Paid") || "Paid"}</SelectItem>
                             <SelectItem value="delayed">{t("Delayed") || "Delayed"}</SelectItem>
                             <SelectItem value="cancelled">{t("Cancelled") || "Cancelled"}</SelectItem>
                           </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}