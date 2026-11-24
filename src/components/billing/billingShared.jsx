// Podaci i mali delovi koje dele ekrani Client Billing Overview (spec §9).
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { laborDayLines } from "@/lib/finance/laborLines";
import { formatMoney } from "@/lib/projectCosts";
import { intlLocale } from "@/lib/dateFormat";
import { sortCurrencies } from "@/lib/finance/currency";
import { cn } from "@/lib/utils";

export const BILLING_KEY = ["billing"];

/** Osvežava sve prikaze obračuna (lista, detalj, troškovi koji su postali vezani). */
export function invalidateBilling(queryClient) {
  queryClient.invalidateQueries({ queryKey: BILLING_KEY });
  queryClient.invalidateQueries({ queryKey: ["project-costs"] });
}

export function useInvalidateBilling() {
  const qc = useQueryClient();
  return () => invalidateBilling(qc);
}

const personName = (e) => (e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() || e.employee_id || "—" : "—");
const projectLabel = (p) => (p ? (p.project_number ? `${p.project_number} — ${p.name}` : p.name) : "—");

/**
 * Svi podaci Billing Overview-a. Satnice: samo odobrene (T09); iznosi kroz timesheet_money po pravu (T26).
 * Linije računa laborDayLines (T-E) — isto pravilo kao baza (set_billing_status).
 */
export function useBillingData(enabled) {
  const opts = (key, queryFn) => ({ queryKey: [...BILLING_KEY, key], queryFn, enabled });
  const clients = useQuery(opts("clients", () => base44.entities.Client.list("name")));
  const projects = useQuery(opts("projects", () => base44.entities.Project.list("name")));
  const assignments = useQuery(opts("assignments", () => base44.entities.ProjectAssignment.list()));
  const employees = useQuery(opts("employees", () => base44.entities.Employee.list("first_name")));
  const roles = useQuery(opts("roles", () => base44.entities.ProjectRole.list("title")));
  const hourTypes = useQuery(opts("hour-types", () => base44.entities.HourType.list("sort")));
  const timesheets = useQuery(opts("timesheets", () => base44.entities.Timesheet.filter({ approval_status: "approved" }, "-week_start")));
  const summaries = useQuery(opts("summaries", () => base44.entities.BillingSummary.list("-period_start")));
  const lines = useQuery(opts("lines", () => base44.entities.BillingSummaryLine.list()));
  const links = useQuery(opts("costs-links", () => base44.entities.BillingSummaryCost.list()));
  const payments = useQuery(opts("payments", () => base44.entities.ClientPayment.list("-payment_date")));
  const costs = useQuery(opts("costs", () => base44.entities.ProjectCost.filter({ billable: true }, "-cost_date")));

  const all = [clients, projects, assignments, employees, roles, hourTypes, timesheets, summaries, lines, links, payments, costs];
  const isLoading = all.some((x) => x.isLoading);
  const isError = all.some((x) => x.isError);
  const refetch = () => all.forEach((x) => x.refetch());

  const data = useMemo(() => {
    const byId = (list) => new Map((list || []).map((x) => [x.id, x]));
    const clientsById = byId(clients.data);
    const projectsById = byId(projects.data);
    const employeesById = byId(employees.data);
    const rolesById = byId(roles.data);
    const hourTypeNames = new Map((hourTypes.data || []).map((h) => [h.code, h.name]));
    const { lines: laborLines, problems } = laborDayLines(timesheets.data || [], { projects: projects.data || [], assignments: assignments.data || [] });
    const lookup = {
      clientName: (id) => clientsById.get(id)?.name || "—",
      projectName: (id) => projectLabel(projectsById.get(id)),
      employeeName: (id) => personName(employeesById.get(id)),
      roleName: (id) => rolesById.get(id)?.title || "",
      hourTypeName: (code) => hourTypeNames.get(code) || code || "",
    };
    return {
      clients: clients.data || [],
      projects: projects.data || [],
      summaries: summaries.data || [],
      dbLines: lines.data || [],
      links: links.data || [],
      payments: payments.data || [],
      costs: costs.data || [],
      laborLines,
      problems,
      projectsById,
      clientsById,
      lookup,
    };
  }, [clients.data, projects.data, assignments.data, employees.data, roles.data, hourTypes.data, timesheets.data, summaries.data, lines.data, links.data, payments.data, costs.data]);

  return { ...data, isLoading, isError, refetch };
}

/** Iznosi po valuti, jedan ispod drugog (nikad zbir preko valuta, T28). */
export function MoneyList({ byCurrency, lang, empty = "—", className }) {
  const locale = intlLocale(lang);
  const curs = sortCurrencies(Object.keys(byCurrency || {}));
  if (!curs.length) return <span className={cn("text-muted-foreground", className)}>{empty}</span>;
  return (
    <span className={cn("flex flex-col", className)}>
      {curs.map((c) => <span key={c} className="tabular-nums">{formatMoney(byCurrency[c], c, locale)}</span>)}
    </span>
  );
}

export const money = (amount, currency, lang) =>
  amount === null || amount === undefined ? "—" : formatMoney(amount, currency, intlLocale(lang));

const STATUS_CLASS = {
  in_preparation: "bg-muted text-muted-foreground",
  ready_for_accounting: "bg-primary/10 text-primary",
  sent_to_accounting: "bg-warning-soft text-warning",
  invoiced_externally: "bg-success-soft text-success",
};
export function BillingStatusBadge({ status, T }) {
  return <Badge variant="outline" className={cn("border-transparent font-medium whitespace-nowrap", STATUS_CLASS[status])}>{T.statuses[status] || status}</Badge>;
}

const PAY_CLASS = { unpaid: "bg-muted text-muted-foreground", partially_paid: "bg-warning-soft text-warning", paid: "bg-success-soft text-success" };
export function PaymentStatusBadge({ status, overdue, T }) {
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <Badge variant="outline" className={cn("border-transparent font-medium whitespace-nowrap", PAY_CLASS[status])}>{T.paymentStatuses[status] || status}</Badge>
      {overdue && <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive whitespace-nowrap">{T.overdue}</Badge>}
    </span>
  );
}
