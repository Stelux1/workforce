// Project → Financial Report (spec §2.2, §10): odobreni rad, prihod, payroll cost, dodatni troškovi, rezultat, interni
// obračuni, evidentirane uplate i otvorena potraživanja — po valuti, uz izvoz PDF/CSV.
// Isti izveštaj kao centralni Financial Reports, sa filterom po ID-u projekta (preimenovanje ne menja brojke, T25).
// Payroll Cost = Approved × B2C × worker coef (K4); srpski bruto 2 je samo na stranici Mesečni obračun.
import FinancialReportPanel from "@/components/reports/FinancialReportPanel";

export default function ProjectFinancialReport({ project }) {
  return <FinancialReportPanel projectId={project.id} projectName={project.name} />;
}
