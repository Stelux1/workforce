// Workforce Planning (spec §13): plan radne snage po projektima — Gantt, Required Workforce, Coverage.
import PageHeader from "@/components/shared/PageHeader";
import WorkforcePlanner from "@/components/workforce/WorkforcePlanner";
import { useSearchParams } from "react-router-dom";
import { readListParams } from "@/lib/listLinks";
import { useL } from "@/lib/translations";

export default function WorkforcePlanningPage() {
  const L = useL();
  const [params] = useSearchParams();
  const q = readListParams(params);
  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
      <PageHeader
        title={L("Workforce Planning", "Planiranje radne snage", "Plánovanie pracovnej sily")}
        subtitle={L(
          "Who is needed, who covers each shift and where there is a shortage or surplus.",
          "Koliko radnika treba, ko pokriva koju smenu i gde ima manjka ili viška.",
          "Koľko pracovníkov treba, kto pokrýva ktorú zmenu a kde je nedostatok alebo prebytok."
        )}
      />
      <WorkforcePlanner initialProject={q.project} initialFrom={q.from} initialTo={q.to} initialClient={q.client} initialPstatus={q.pstatus} />
    </div>
  );
}
