import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const payload = await req.json().catch(() => ({}));
  
  // If triggered by entity automation, get the specific employee
  const employeeId = payload?.event?.entity_id || payload?.employee_id;

  const employees = await base44.asServiceRole.entities.Employee.list();
  
  // Build a map of employee_id -> "last_name first_name"
  const employeeMap = {};
  for (const emp of employees) {
    employeeMap[emp.id] = `${emp.last_name} ${emp.first_name}`;
  }

  // If specific employee triggered this, only process that one
  const targetIds = employeeId ? [employeeId] : Object.keys(employeeMap);

  let updatedProjects = 0;
  let updatedTimesheets = 0;
  let updatedPayroll = 0;
  let updatedLeave = 0;
  let updatedTasks = 0;
  let updatedSchedules = 0;

  // --- Update Projects (assigned_employees array) ---
  const projects = await base44.asServiceRole.entities.Project.list();
  for (const project of projects) {
    if (!project.assigned_employees?.length) continue;
    let changed = false;
    const updated = project.assigned_employees.map(ae => {
      if (targetIds.includes(ae.employee_id) && employeeMap[ae.employee_id] && ae.employee_name !== employeeMap[ae.employee_id]) {
        changed = true;
        return { ...ae, employee_name: employeeMap[ae.employee_id] };
      }
      return ae;
    });
    if (changed) {
      await base44.asServiceRole.entities.Project.update(project.id, { assigned_employees: updated });
      updatedProjects++;
    }
  }

  // --- Update Timesheets ---
  const timesheets = await base44.asServiceRole.entities.Timesheet.list();
  for (const ts of timesheets) {
    if (!targetIds.includes(ts.employee_id)) continue;
    const newName = employeeMap[ts.employee_id];
    if (newName && ts.employee_name !== newName) {
      await base44.asServiceRole.entities.Timesheet.update(ts.id, { employee_name: newName });
      updatedTimesheets++;
    }
  }

  // --- Update PayrollRecords ---
  const payrolls = await base44.asServiceRole.entities.PayrollRecord.list();
  for (const pr of payrolls) {
    if (!targetIds.includes(pr.employee_id)) continue;
    const newName = employeeMap[pr.employee_id];
    if (newName && pr.employee_name !== newName) {
      await base44.asServiceRole.entities.PayrollRecord.update(pr.id, { employee_name: newName });
      updatedPayroll++;
    }
  }

  // --- Update LeaveRequests ---
  const leaves = await base44.asServiceRole.entities.LeaveRequest.list();
  for (const lr of leaves) {
    if (!targetIds.includes(lr.employee_id)) continue;
    const newName = employeeMap[lr.employee_id];
    if (newName && lr.employee_name !== newName) {
      await base44.asServiceRole.entities.LeaveRequest.update(lr.id, { employee_name: newName });
      updatedLeave++;
    }
  }

  // --- Update Tasks ---
  const tasks = await base44.asServiceRole.entities.Task.list();
  for (const task of tasks) {
    if (!targetIds.includes(task.assigned_to)) continue;
    const newName = employeeMap[task.assigned_to];
    if (newName && task.assigned_to_name !== newName) {
      await base44.asServiceRole.entities.Task.update(task.id, { assigned_to_name: newName });
      updatedTasks++;
    }
  }

  // --- Update Schedules ---
  const schedules = await base44.asServiceRole.entities.Schedule.list();
  for (const sc of schedules) {
    if (!targetIds.includes(sc.employee_id)) continue;
    const newName = employeeMap[sc.employee_id];
    if (newName && sc.employee_name !== newName) {
      await base44.asServiceRole.entities.Schedule.update(sc.id, { employee_name: newName });
      updatedSchedules++;
    }
  }

  return Response.json({
    success: true,
    updated: { projects: updatedProjects, timesheets: updatedTimesheets, payroll: updatedPayroll, leave: updatedLeave, tasks: updatedTasks, schedules: updatedSchedules }
  });
});