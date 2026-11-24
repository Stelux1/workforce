// Add Assignment (§4.5): Employee, Project, Job Role, datumi, planirana smena, B2C i posebna B2B tarifa (uz
// rates.manage). Jedan dijalog za ceo program — isti koristi Project → Workers (create_assignment RPC u bazi).
import AssignmentDialog from "@/components/rates/AssignmentDialog";

export default function AddAssignmentDialog({ open, onOpenChange, projects, employees, history, project }) {
  return (
    <AssignmentDialog open={open} onOpenChange={onOpenChange} assignment={null} project={project}
      projects={projects} employees={employees} history={history} />
  );
}
