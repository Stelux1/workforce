// Predlozi zamena za smenu sa manjkom (spec §14.2). Rangiranje radi `src/lib/replacements.js` (traka W2-L), a
// objašnjenja i oznake dolaze iz `components/leave/common`. Dodela zamene je na ekranu Leave Requests.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useL } from "@/lib/translations";
import { qualifiedEmployeeIds } from "@/lib/workforceUi";
import { rankCandidates } from "@/lib/replacements";
import { CategoryChip, MissingDocs, makeLookups, reasonTone, useReasonText } from "@/components/leave/common";
import { ErrorNote } from "./common";

export default function ReplacementSuggestions({ need, role, data }) {
  const L = useL();
  const hasRanker = true;
  const lookups = useMemo(() => makeLookups(data), [data]);
  const reasonText = useReasonText(lookups);

  const candidateIds = useMemo(
    () => qualifiedEmployeeIds({ role, assignments: data.assignments, projectRoles: data.roles }).slice(0, 150),
    [role, data.assignments, data.roles]
  );

  const docsQ = useQuery({
    queryKey: ["workforce", "replacement-docs", need.projectId, need.projectRoleId, candidateIds],
    enabled: hasRanker && candidateIds.length > 0,
    queryFn: async () => {
      const [documents, requiredDocuments] = await Promise.all([
        base44.entities.Document.filter({ employee_id: candidateIds }),
        base44.entities.RequiredDocument.filter({ project_id: need.projectId }),
      ]);
      return { documents, requiredDocuments };
    },
  });

  const ranked = useMemo(() => {
    if (!hasRanker || !docsQ.data) return null;
    try {
      const ids = new Set(candidateIds);
      return {
        rows: rankCandidates({
          need,
          employees: data.employees.filter((e) => ids.has(e.id)),
          assignments: data.assignments,
          schedules: data.schedules,
          leaves: data.leaves,
          shifts: data.shifts,
          documents: docsQ.data.documents,
          requiredDocuments: docsQ.data.requiredDocuments,
          projects: data.projects,
          projectRoles: data.roles,
          requirements: data.requirements,
        }),
      };
    } catch (error) {
      return { error };
    }
  }, [docsQ.data, need, candidateIds, data]);

  return (
    <section className="space-y-2" data-testid="replacement-suggestions">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" />{L("Replacement suggestions", "Predlozi zamena", "Návrhy zástupov")}</h4>
      {candidateIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">{L("No qualified workers found for this Job Role.", "Nema kvalifikovanih radnika za ovaj Job Role.", "Pre túto Job Role sa nenašli kvalifikovaní pracovníci.")}</p>
      ) : docsQ.error ? (
        <ErrorNote error={docsQ.error} onRetry={() => docsQ.refetch()} />
      ) : ranked?.error ? (
        <ErrorNote error={ranked.error} />
      ) : !ranked ? (
        <p className="text-sm text-muted-foreground">{L("Ranking candidates…", "Rangiranje kandidata…", "Zoraďujú sa kandidáti…")}</p>
      ) : ranked.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{L("No candidates.", "Nema kandidata.", "Žiadni kandidáti.")}</p>
      ) : (
        <ol className="space-y-1.5">
          {ranked.rows.slice(0, 8).map((c) => (
            <li key={c.employeeId} className="rounded-lg border p-2 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">{lookups.employee(c.employeeId)}</span>
                <CategoryChip category={c.category} />
              </div>
              <ul className="flex flex-wrap gap-1">
                {c.reasons.map((r, i) => (
                  <li key={`${r.code}-${i}`} className={`rounded-full px-2 py-0.5 text-xs ${reasonTone(r.code) === "good" ? "bg-success-soft text-success" : reasonTone(r.code) === "bad" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>{reasonText(r)}</li>
                ))}
              </ul>
              <MissingDocs items={c.missingDocuments} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
