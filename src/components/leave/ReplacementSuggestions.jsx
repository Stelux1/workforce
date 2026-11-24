// Smart Replacement (spec §14.2, T22): za svaku smenu u kojoj odsustvo pravi manjak — kandidati po redosledu
// kriterijuma (uloga → puna raspoloživost → sertifikati → onboarding readiness → lokacija → B2C), kategorija i
// objašnjenje za svakog, dokumenta koja nedostaju se ne skrivaju. Rangiranje: rankCandidates (src/lib/replacements.js).
// Radnik se ne premešta automatski — samo dugme Assign uz potvrdu (AssignReplacementDialog).
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { rankCandidates } from "@/lib/replacements";
import { isoDate } from "@/lib/onboarding";
import AssignReplacementDialog from "./AssignReplacementDialog";
import { CategoryChip, ErrorNote, MissingDocs, makeLookups, reasonTone, useReasonText } from "./common";
import { useReplacementData } from "./useReplacementData";

const TONE = { good: "bg-success-soft text-success", bad: "bg-destructive/10 text-destructive", neutral: "bg-muted text-muted-foreground" };
const TOP = 6;

function CandidateRow({ c, lookups, canAssign, onAssign, reasonText }) {
  const L = useL();
  return (
    <li className="rounded-lg border p-3 space-y-2" data-testid={`candidate-${c.category}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-sm">{lookups.employee(c.employeeId)}</span>
          <CategoryChip category={c.category} />
          {c.standby && <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning">{L("Standby", "Pripravnost", "Pohotovosť")}</span>}
          {c.category !== "not_eligible" && <span className="text-xs text-muted-foreground tabular-nums">{L("score", "ocena", "skóre")} {c.score}</span>}
        </div>
        {canAssign && c.category !== "not_eligible" && (
          <Button size="sm" variant={c.category === "full_match" ? "default" : "outline"} onClick={() => onAssign(c)}>
            {L("Assign replacement", "Dodeli zamenu", "Prideliť zástup")}
          </Button>
        )}
      </div>
      <ul className="flex flex-wrap gap-1">
        {c.reasons.map((r, i) => (
          <li key={`${r.code}-${i}`} className={`rounded-full px-2 py-0.5 text-xs ${TONE[reasonTone(r.code)]}`}>{reasonText(r)}</li>
        ))}
      </ul>
      <MissingDocs items={c.missingDocuments} />
    </li>
  );
}

export default function ReplacementSuggestions({ leave, canAssign, canViewB2C }) {
  const L = useL();
  const { lang } = useLang();
  const { data, docs, rates, needs, leavesAsApproved, loading, error } = useReplacementData(leave, { canViewB2C });
  const lookups = useMemo(() => makeLookups(data || {}), [data]);
  const reasonText = useReasonText(lookups);
  const [assigning, setAssigning] = useState(null); // { need, candidate }
  const [showAll, setShowAll] = useState({});

  const ranked = useMemo(() => {
    if (!data) return [];
    return needs.map((need) => ({
      need,
      candidates: rankCandidates({
        need, employees: data.employees, assignments: data.assignments, schedules: data.schedules, leaves: leavesAsApproved,
        shifts: data.shifts, documents: docs.documents, requiredDocuments: docs.requiredDocuments, documentTypes: docs.documentTypes,
        projects: data.projects, projectRoles: data.roles, requirements: data.requirements, rates, canViewB2C,
        today: isoDate(), excludeEmployeeIds: [leave.employee_id],
      }),
    }));
  }, [data, needs, docs, rates, canViewB2C, leavesAsApproved, leave]);

  // Obaveštenje „kandidat za zamenu" (W2-H) za odobreno odsustvo sa manjkom: najbolji kandidati po potrebi, jednom.
  const notified = useRef(null);
  useEffect(() => {
    if (!canAssign || leave.status !== "approved" || loading || !ranked.length || notified.current === leave.id) return;
    const list = ranked.flatMap(({ need, candidates }) => candidates
      .filter((c) => c.category === "full_match" || c.category === "partial_availability").slice(0, 3)
      .map((c) => ({ employee_id: c.employeeId, project_id: need.projectId, category: c.category })));
    notified.current = leave.id;
    if (list.length) base44.rpc("notify_replacement_candidates", { p_leave: leave.id, p_candidates: list }).catch(() => {});
  }, [canAssign, leave, loading, ranked]);

  if (loading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (error) return <ErrorNote error={error} />;
  if (!needs.length) {
    return (
      <p className="rounded-lg border border-success/30 bg-success-soft p-3 text-sm text-success" data-testid="no-replacement-needed">
        {L("No shift is short because of this leave — no replacement needed.", "Nijedna smena nije u manjku zbog ovog odsustva — zamena nije potrebna.", "Kvôli tejto neprítomnosti nechýba v žiadnej zmene nikto — zástup nie je potrebný.")}
      </p>
    );
  }

  return (
    <div className="space-y-4" data-testid="replacement-suggestions">
      {ranked.map(({ need, candidates }) => {
        const key = `${need.projectId}|${need.projectRoleId}|${need.shiftId}|${need.from}`;
        const eligible = candidates.filter((c) => c.category !== "not_eligible");
        const notEligible = candidates.filter((c) => c.category === "not_eligible");
        const open = !!showAll[key];
        const shown = open ? eligible : eligible.slice(0, TOP);
        return (
          <section key={key} className="space-y-2">
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {lookups.project(need.projectId)} · {lookups.role(need.projectRoleId)} · {lookups.shift(need.shiftId)}
              </h3>
              <span className="text-xs text-muted-foreground">
                {formatIsoDate(need.from, lang)} – {formatIsoDate(need.to, lang)} ·{" "}
                <span className="font-semibold text-destructive">{L(`shortage ${need.deficit}`, `deficit ${need.deficit}`, `deficit ${need.deficit}`)}</span>
              </span>
            </header>
            {eligible.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                <Users className="w-4 h-4" />
                {L("No qualified worker is free or transferable for this shift.", "Nijedan kvalifikovan radnik nije slobodan ni premestiv za ovu smenu.", "Žiadny kvalifikovaný pracovník nie je voľný ani presunuteľný pre túto zmenu.")}
              </p>
            ) : (
              <ul className="space-y-2">
                {shown.map((c) => (
                  <CandidateRow key={c.employeeId} c={c} lookups={lookups} canAssign={canAssign} reasonText={reasonText} onAssign={(cand) => setAssigning({ need, candidate: cand })} />
                ))}
              </ul>
            )}
            {(eligible.length > TOP || notEligible.length > 0) && (
              <button type="button" className="flex items-center gap-1 text-xs text-primary" onClick={() => setShowAll((s) => ({ ...s, [key]: !open }))}>
                {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                {open
                  ? L("Show fewer", "Prikaži manje", "Zobraziť menej")
                  : L(`Show all (${eligible.length} eligible, ${notEligible.length} not eligible)`, `Prikaži sve (${eligible.length} kandidata, ${notEligible.length} ne ispunjava uslove)`, `Zobraziť všetko (${eligible.length} kandidátov, ${notEligible.length} nespĺňa podmienky)`)}
              </button>
            )}
            {open && notEligible.length > 0 && (
              <ul className="space-y-2 opacity-80">
                {notEligible.map((c) => (
                  <CandidateRow key={c.employeeId} c={c} lookups={lookups} canAssign={false} reasonText={reasonText} onAssign={() => {}} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {!canAssign && (
        <p className="text-xs text-muted-foreground">
          {L("Assigning a replacement requires the “Workforce” permission.", "Dodela zamene traži pravo „Workforce”.", "Pridelenie zástupu vyžaduje oprávnenie „Workforce”.")}
        </p>
      )}
      <AssignReplacementDialog
        open={!!assigning}
        onOpenChange={(v) => !v && setAssigning(null)}
        leave={leave}
        need={assigning?.need}
        candidate={assigning?.candidate}
        data={data}
        leavesAsApproved={leavesAsApproved}
        lookups={lookups}
      />
    </div>
  );
}
