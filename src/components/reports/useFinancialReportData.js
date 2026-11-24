// Podaci za Financial Report (projekat i centralni). Samo čitanje — sve brojke računa src/lib/payroll/projectReport.js
// (omotač oko financialSummary). Server vraća samo ono na šta korisnik ima pravo (RLS, timesheet_money maska, T26).
//
// Novčani tokovi (billing_summaries, client_payments, payables, payable_lines, payments) dolaze iz traka W2-E/W2-F.
// Dok tabela ne postoji, sekcija je „nema podataka" (status 'missing'); bez prava 'denied' — nikad izmišljena nula.
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { requireSupabase } from "@/api/supabase";
import { useAuth } from "@/lib/AuthContext";

const PAGE = 1000;
// 42P01 = relacija ne postoji (Postgres), PGRST205 = tabela nije u šemi PostgREST-a.
const MISSING_CODES = new Set(["42P01", "PGRST205", "PGRST200"]);

/** Čita celu tabelu; tabela koja (još) ne postoji → { status: 'missing' }, odbijeno pravo → { status: 'denied' }. */
export async function readOptionalTable(table, { eq = null } = {}) {
  const sb = requireSupabase();
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select("*");
    if (eq) for (const [k, v] of Object.entries(eq)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
    const { data, error } = await q.order("id").range(from, from + PAGE - 1);
    if (error) {
      if (MISSING_CODES.has(error.code) || /does not exist|schema cache/i.test(error.message || "")) return { status: "missing", rows: [] };
      if (error.code === "42501") return { status: "denied", rows: [] };
      throw new Error(error.message || String(error));
    }
    rows.push(...(data || []));
    if ((data || []).length < PAGE) break;
  }
  return { status: "ok", rows };
}

const merge = (...parts) => {
  if (parts.some((p) => p.status === "denied")) return "denied";
  if (parts.some((p) => p.status === "missing")) return "missing";
  return "ok";
};

/**
 * @param {{projectId?: string|null}} opts projectId — Financial Report kartica projekta (satnice/troškovi samo tog projekta)
 * @returns {{loading, error, data: {timesheets, costs, projects, clients, employees, assignments, roles, categories,
 *   exchangeRates, billing: {status, summaries, clientPayments}, payables: {status, payables, payableLines, payments}}}}
 */
export function useFinancialReportData({ projectId = null } = {}) {
  const { can } = useAuth();
  const canBilling = can("billing.view");
  const canPayroll = can("payroll.view");
  const scope = projectId || "all";

  const q = {
    // Sve satnice projekta, ili centralno odobrene + predate (predate su samo procena, odvojeno).
    timesheets: useQuery({
      queryKey: ["financial-report", "timesheets", scope],
      queryFn: () => (projectId
        ? base44.entities.Timesheet.filter({ project_id: projectId }, "-week_start")
        : base44.entities.Timesheet.filter({ approval_status: ["approved", "submitted"] }, "-week_start")),
    }),
    costs: useQuery({
      queryKey: ["project-costs", scope],
      queryFn: () => (projectId ? base44.entities.ProjectCost.filter({ project_id: projectId }, "-cost_date") : base44.entities.ProjectCost.list("-cost_date")),
      enabled: can("costs.view"),
    }),
    projects: useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list("name") }),
    clients: useQuery({ queryKey: ["clients"], queryFn: () => base44.entities.Client.list("name") }),
    employees: useQuery({ queryKey: ["employees"], queryFn: () => base44.entities.Employee.list("first_name") }),
    assignments: useQuery({
      queryKey: ["project-assignments", scope],
      queryFn: () => (projectId ? base44.entities.ProjectAssignment.filter({ project_id: projectId }) : base44.entities.ProjectAssignment.list()),
    }),
    roles: useQuery({
      queryKey: ["project-roles", scope],
      queryFn: () => (projectId ? base44.entities.ProjectRole.filter({ project_id: projectId }, "sort") : base44.entities.ProjectRole.list("title")),
    }),
    categories: useQuery({ queryKey: ["cost-categories"], queryFn: () => base44.entities.CostCategory.list("name", 200) }),
    exchangeRates: useQuery({ queryKey: ["exchange-rates"], queryFn: () => base44.entities.ExchangeRate.list("-rate_date") }),
    billing: useQuery({
      queryKey: ["financial-report", "billing", scope],
      queryFn: async () => {
        const [summaries, clientPayments] = await Promise.all([readOptionalTable("billing_summaries"), readOptionalTable("client_payments")]);
        return { status: merge(summaries, clientPayments), summaries: summaries.rows, clientPayments: clientPayments.rows };
      },
      enabled: canBilling,
      staleTime: 0,
    }),
    payables: useQuery({
      queryKey: ["financial-report", "payables", scope],
      queryFn: async () => {
        const [payables, payableLines, payments] = await Promise.all([
          readOptionalTable("payables"), readOptionalTable("payable_lines"), readOptionalTable("payments"),
        ]);
        return { status: merge(payables, payableLines, payments), payables: payables.rows, payableLines: payableLines.rows, payments: payments.rows };
      },
      enabled: canPayroll,
      staleTime: 0,
    }),
  };

  const core = ["timesheets", "costs", "projects", "assignments", "categories"];
  const loading = core.some((k) => q[k].isLoading && q[k].fetchStatus !== "idle");
  const error = [...core, "projects", "clients", "employees", "roles", "exchangeRates"].map((k) => q[k].error).find(Boolean) || null;
  const flow = (allowed, query) => {
    if (!allowed) return { status: "denied" };
    if (query.error) return { status: "error", message: query.error.message };
    if (query.isLoading) return { status: "loading" };
    return query.data || { status: "missing" };
  };

  return {
    loading,
    error,
    refetch: () => Object.values(q).forEach((x) => x.refetch()),
    data: {
      timesheets: q.timesheets.data || [],
      costs: q.costs.data || [],
      projects: q.projects.data || [],
      clients: q.clients.data || [],
      employees: q.employees.data || [],
      assignments: q.assignments.data || [],
      roles: q.roles.data || [],
      categories: q.categories.data || [],
      exchangeRates: q.exchangeRates.data || [],
      billing: flow(canBilling, q.billing),
      payables: flow(canPayroll, q.payables),
    },
  };
}
