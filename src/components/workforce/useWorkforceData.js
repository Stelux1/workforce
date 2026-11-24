// Podaci za Workforce Planning. Pokrivenost se računa u pregledaču iz `src/lib/workforce.js` (isti izračun kao SQL
// `workforce_coverage`), pa izmena potrebnog broja ili rasporeda odmah menja tabelu i Gantt posle osvežavanja upita.
import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { addDaysIso, coverage } from "@/lib/workforce";

export const WF_KEY = "workforce";

export function useWorkforceData({ from, to, projectId = null }) {
  const queryClient = useQueryClient();
  const e = base44.entities;
  // Raspored i odsustva se čitaju sa jednim danom rezerve sa obe strane (smena preko ponoći dodiruje susedne dane).
  const lo = addDaysIso(from, -1);
  const hi = addDaysIso(to, 1);

  const projectsQ = useQuery({ queryKey: [WF_KEY, "projects"], queryFn: () => e.Project.list("name") });
  const rolesQ = useQuery({ queryKey: [WF_KEY, "roles"], queryFn: () => e.ProjectRole.list("sort") });
  const shiftsQ = useQuery({ queryKey: [WF_KEY, "shifts"], queryFn: () => e.Shift.list("sort") });
  const employeesQ = useQuery({ queryKey: [WF_KEY, "employees"], queryFn: () => e.Employee.list("first_name") });
  const assignmentsQ = useQuery({ queryKey: [WF_KEY, "assignments"], queryFn: () => e.ProjectAssignment.list("start_date") });
  const requirementsQ = useQuery({
    queryKey: [WF_KEY, "requirements", projectId || "all", from, to],
    queryFn: () =>
      e.WorkforceRequirement.filter({ ...(projectId ? { project_id: projectId } : {}), date_to: { $gte: from }, date_from: { $lte: to } }, "date_from"),
  });
  const schedulesQ = useQuery({
    queryKey: [WF_KEY, "schedules", lo, hi],
    queryFn: () => e.Schedule.filter({ date: { $gte: lo, $lte: hi } }, "date"),
  });
  const leavesQ = useQuery({
    queryKey: [WF_KEY, "leaves", lo, hi],
    queryFn: () => e.LeaveRequest.filter({ status: "approved", end_date: { $gte: lo }, start_date: { $lte: hi } }, "start_date"),
  });

  const queries = [projectsQ, rolesQ, shiftsQ, employeesQ, assignmentsQ, requirementsQ, schedulesQ, leavesQ];
  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error || null;

  const data = useMemo(
    () => ({
      projects: projectsQ.data || [],
      roles: rolesQ.data || [],
      shifts: [...(shiftsQ.data || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || String(a.start_time).localeCompare(String(b.start_time))),
      employees: employeesQ.data || [],
      assignments: assignmentsQ.data || [],
      requirements: requirementsQ.data || [],
      schedules: schedulesQ.data || [],
      leaves: leavesQ.data || [],
    }),
    [projectsQ.data, rolesQ.data, shiftsQ.data, employeesQ.data, assignmentsQ.data, requirementsQ.data, schedulesQ.data, leavesQ.data]
  );

  const coverageRows = useMemo(
    () =>
      coverage({
        requirements: data.requirements,
        assignments: data.assignments,
        schedules: data.schedules,
        leaves: data.leaves,
        shifts: data.shifts,
        from,
        to,
        projectId,
      }),
    [data, from, to, projectId]
  );

  return {
    ...data,
    coverageRows,
    isLoading,
    error,
    refetch: () => queryClient.invalidateQueries({ queryKey: [WF_KEY] }),
  };
}
