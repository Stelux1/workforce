// Podaci za predloge zamena jednog odsustva (spec §14.2): radnici, dodele, raspored i odsustva u periodu (± dan zbog
// smena preko ponoći), smene, Job Roles, potreban broj, dokumenta i zahtevi dokumenata projekata sa manjkom, tarife
// samo uz rates.view_b2c. Pokrivenost i kandidati se računaju u pregledaču (src/lib/workforce.js, replacements.js),
// isto kao u bazi (`workforce_coverage`, `assign_replacement`).
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { addDaysIso, coverage } from "@/lib/workforce";
import { replacementNeeds } from "@/lib/replacements";

export const REPL_KEY = "leave-replacement-data";

export function useReplacementData(leave, { canViewB2C = false, enabled = true } = {}) {
  const e = base44.entities;
  const on = enabled && !!leave?.id;
  const lo = leave ? addDaysIso(leave.start_date, -1) : null;
  const hi = leave ? addDaysIso(leave.end_date, 1) : null;

  const base = useQuery({
    queryKey: [REPL_KEY, leave?.id, lo, hi],
    enabled: on,
    queryFn: async () => {
      const [projects, roles, shifts, employees, assignments, requirements, schedules, leaves] = await Promise.all([
        e.Project.list("name"),
        e.ProjectRole.list("sort"),
        e.Shift.list("sort"),
        e.Employee.list("first_name"),
        e.ProjectAssignment.list("start_date"),
        e.WorkforceRequirement.filter({ date_to: { $gte: lo }, date_from: { $lte: hi } }, "date_from"),
        e.Schedule.filter({ date: { $gte: lo, $lte: hi } }, "date"),
        e.LeaveRequest.filter({ end_date: { $gte: lo }, start_date: { $lte: hi } }, "start_date"),
      ]);
      return { projects, roles, shifts, employees, assignments, requirements, schedules, leaves };
    },
  });

  // Manjak zbog ovog odsustva: red pokrivenosti u kome je radnik planiran, a odsutan (zahtev na čekanju se simulira).
  const derived = useMemo(() => {
    if (!base.data || !leave) return null;
    const d = base.data;
    const approvedOrThis = d.leaves.filter((l) => l.status === "approved" || l.id === leave.id);
    const rows = coverage({
      requirements: d.requirements, assignments: d.assignments, schedules: d.schedules, leaves: approvedOrThis, shifts: d.shifts,
      from: leave.start_date, to: leave.end_date, simulateLeaveId: leave.id,
    }).filter((r) => r.deficit > 0 && r.missing.includes(leave.employee_id));
    // Za proveru zamene odsustvo se računa kao odobreno (posle potvrde zamena važi tek tada).
    const leavesAsApproved = approvedOrThis.map((l) => (l.id === leave.id ? { ...l, status: "approved" } : l));
    return { rows, needs: replacementNeeds(rows), leavesAsApproved };
  }, [base.data, leave]);

  const projectIds = useMemo(() => [...new Set((derived?.needs || []).map((n) => n.projectId))], [derived]);
  const docs = useQuery({
    queryKey: [REPL_KEY, "docs", projectIds.join(",")],
    enabled: on && projectIds.length > 0,
    queryFn: async () => {
      const [documents, requiredDocuments, documentTypes] = await Promise.all([
        e.Document.list("-created_date"),
        e.RequiredDocument.filter({ project_id: { $in: projectIds } }),
        e.DocumentType.list("sort"),
      ]);
      return { documents, requiredDocuments, documentTypes };
    },
  });
  const rates = useQuery({
    queryKey: [REPL_KEY, "rates-b2c"],
    enabled: on && canViewB2C,
    queryFn: () => e.Rate.filter({ kind: "cost", status: "active" }),
  });

  const loading = base.isLoading || (projectIds.length > 0 && docs.isLoading) || (canViewB2C && rates.isLoading);
  return {
    data: base.data || null,
    docs: docs.data || { documents: [], requiredDocuments: [], documentTypes: [] },
    rates: canViewB2C ? rates.data || [] : null,
    rows: derived?.rows || [],
    needs: derived?.needs || [],
    leavesAsApproved: derived?.leavesAsApproved || [],
    loading,
    error: base.error || docs.error || rates.error || null,
  };
}
