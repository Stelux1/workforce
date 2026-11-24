// Assign Replacement (spec §14.2, T23): privremena dodela po datumu i smeni nastaje tek kad ovlašćeni korisnik potvrdi.
// Pre potvrde prikazuje šta se menja: pokrivenost ciljne potrebe posle zamene i — kod premeštaja — manjak koji odlazak
// pravi na izvornom projektu, uz obaveznu izričitu potvrdu. Isto računa i proverava baza (`assign_replacement`);
// bez potvrde baza odbija i ništa ne upisuje. Posle potvrde se osvežavaju Workforce, Coverage i Onboarding.
// Izvorni manjak meri baza na SVIM projektima radnika (`replacement_source_impact`, bez upisa) — i na projektu koji
// korisnik ne vidi; taj se prikazuje po nazivu iz baze (samo brojevi i nazivi). Ako baza ipak odbije premeštaj zbog
// manjka, njen odgovor (DETAIL) postaje upozorenje i traži se potvrda.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { normalizeSourceImpact, replacementImpact, sourceNeedsAck, suggestedRange } from "@/lib/replacements";
import { CategoryChip, MissingDocs, errorText } from "./common";

export default function AssignReplacementDialog({ open, onOpenChange, leave, need, candidate, data, leavesAsApproved, lookups, onAssigned }) {
  const L = useL();
  const { lang } = useLang();
  const queryClient = useQueryClient();
  const [range, setRange] = useState({ from: "", to: "" });
  const [ack, setAck] = useState(false);
  // izvorni manjak iz odbijanja baze (DETAIL), kad stigne pre pregleda ili se stanje promenilo u međuvremenu
  const [rejected, setRejected] = useState(null);

  useEffect(() => {
    if (open && candidate && need) {
      setRange(suggestedRange(candidate, need));
      setAck(false);
      setRejected(null);
    }
  }, [open, candidate, need]);
  useEffect(() => { setRejected(null); }, [range.from, range.to]);

  const validRange = !!range.from && !!range.to && range.from <= range.to && range.from >= need?.from && range.to <= need?.to;
  const rpcArgs = candidate && need && leave ? {
    p_leave: leave.id, p_employee: candidate.employeeId, p_project: need.projectId, p_role: need.projectRoleId, p_shift: need.shiftId,
    p_from: range.from, p_to: range.to, p_source_assignment: candidate.sourceAssignmentId || null,
  } : null;
  // Pregled bez upisa: isti izračun kao pri potvrdi, na svim projektima radnika (i onima koje korisnik ne vidi).
  const preview = useQuery({
    queryKey: ["replacement-source-impact", rpcArgs],
    enabled: open && !!rpcArgs && validRange,
    staleTime: 0,
    retry: false,
    queryFn: () => base44.rpc("replacement_source_impact", rpcArgs),
  });
  const serverSource = rejected || (preview.isSuccess ? preview.data : null);
  const impact = useMemo(() => {
    if (!open || !candidate || !need || !data || !validRange) return null;
    return replacementImpact({
      employeeId: candidate.employeeId, need, from: range.from, to: range.to, requirements: data.requirements,
      assignments: data.assignments, schedules: data.schedules, leaves: leavesAsApproved, shifts: data.shifts, serverSource,
    });
  }, [open, candidate, need, data, validRange, range, leavesAsApproved, serverSource]);
  const needsAck = sourceNeedsAck(impact);
  const checking = validRange && preview.isFetching && !rejected;
  const unavailable = (candidate?.days || []).filter((d) => d.date >= range.from && d.date <= range.to && (d.state === "leave" || d.state === "covering"));

  const assign = useMutation({
    mutationFn: () => base44.rpc("assign_replacement", { ...rpcArgs, p_ack_source_shortage: needsAck && ack }),
    onSuccess: async () => {
      // Server je izvor istine: pokrivenost ciljne potrebe posle zamene.
      let after = null;
      try {
        const cov = await base44.rpc("workforce_coverage", { p_from: range.from, p_to: range.to, p_project: need.projectId, p_simulate_leave: leave.status === "pending" ? leave.id : null });
        after = (cov || []).filter((r) => r.project_role_id === need.projectRoleId && r.shift_id === need.shiftId).reduce((m, r) => Math.max(m, r.deficit), 0);
      } catch { /* prikaz bez broja */ }
      for (const key of ["workforce", "leave-replacement-data", "leave-shortage", "leave-requests", "project-assignments", "onboarding", "schedules"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      toast.success(after == null
        ? L("Replacement assigned", "Zamena je dodeljena", "Zástup bol pridelený")
        : L(`Replacement assigned — shortage now ${after}`, `Zamena je dodeljena — deficit sada ${after}`, `Zástup bol pridelený — deficit teraz ${after}`));
      onAssigned?.({ deficitAfter: after });
      onOpenChange(false);
    },
    onError: (e) => {
      // Odbijanje zbog izvornog manjka nosi tačne redove (i projekat koji korisnik ne vidi) — prikaži ih i traži potvrdu.
      const source = normalizeSourceImpact(e?.details);
      if (source) {
        setRejected(e.details);
        setAck(false);
      }
      toast.error(errorText(e));
    },
  });

  if (!candidate || !need) return null;
  const name = lookups.employee(candidate.employeeId);
  return (
    <Dialog open={open} onOpenChange={(v) => !assign.isPending && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{L("Assign replacement", "Dodeli zamenu", "Prideliť zástup")}</DialogTitle>
          <DialogDescription>
            {name} → {lookups.project(need.projectId)} · {lookups.role(need.projectRoleId)} · {lookups.shift(need.shiftId)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CategoryChip category={candidate.category} />
          <span className="text-muted-foreground">
            {L("Needed", "Potrebno", "Potrebné")}: {formatIsoDate(need.from, lang)} – {formatIsoDate(need.to, lang)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="repl-from">{L("From", "Od", "Od")}</Label>
            <Input id="repl-from" type="date" min={need.from} max={need.to} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="repl-to">{L("To", "Do", "Do")}</Label>
            <Input id="repl-to" type="date" min={need.from} max={need.to} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
          </div>
        </div>
        {!validRange && (
          <p className="text-xs text-destructive">{L("The period must be within the needed dates.", "Period mora biti unutar potrebnih datuma.", "Obdobie musí byť v rámci potrebných dátumov.")}</p>
        )}
        {unavailable.length > 0 && (
          <p className="text-xs text-destructive">
            {L("Not available on", "Nije dostupan", "Nie je k dispozícii")}: {unavailable.map((d) => formatIsoDate(d.date, lang)).join(", ")}
          </p>
        )}

        {candidate.missingDocuments.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium">{L("Missing documents (not hidden)", "Dokumenta koja nedostaju", "Chýbajúce dokumenty")}</p>
            <MissingDocs items={candidate.missingDocuments} />
          </div>
        )}

        {impact && (
          <div className="space-y-2">
            <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${impact.targetDeficitAfter === 0 ? "border-success/30 bg-success-soft text-success" : "border-warning/40 bg-warning-soft text-warning"}`} data-testid="target-after">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                {L(`After confirmation the shortage on this shift will be ${impact.targetDeficitAfter}.`,
                  `Posle potvrde deficit u ovoj smeni biće ${impact.targetDeficitAfter}.`,
                  `Po potvrdení bude deficit v tejto zmene ${impact.targetDeficitAfter}.`)}
              </span>
            </div>

            {checking && (
              <p className="text-xs text-muted-foreground" data-testid="source-checking">
                {L("Checking the impact on the employee's other projects…", "Proveravam posledicu po ostale projekte radnika…", "Kontrolujem dopad na ostatné projekty pracovníka…")}
              </p>
            )}
            {preview.isError && !rejected && (
              <p className="flex items-start gap-2 text-xs text-warning" role="alert">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  {L("The impact on the source project could not be checked on the server: ", "Posledica po izvorni projekat nije proverena na serveru: ", "Dopad na zdrojový projekt sa nepodarilo overiť na serveri: ")}
                  {errorText(preview.error)}
                </span>
              </p>
            )}

            {needsAck && (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="source-warning">
                <p className="flex items-start gap-2 font-medium text-destructive">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  {impact.sourceMissing > 0
                    ? L(`Moving ${name} creates a shortage of ${impact.sourceMissing} on the source project:`,
                      `Premeštaj radnika ${name} pravi manjak ${impact.sourceMissing} na izvornom projektu:`,
                      `Presun pracovníka ${name} spôsobí nedostatok ${impact.sourceMissing} na zdrojovom projekte:`)
                    : L(`Moving ${name} releases their schedule on a project you can't access.`,
                      `Premeštaj radnika ${name} oslobađa njegov raspored na projektu kome nemate pristup.`,
                      `Presun pracovníka ${name} uvoľní jeho rozvrh na projekte, ku ktorému nemáte prístup.`)}
                </p>
                <ul className="space-y-0.5 pl-6 text-destructive">
                  {impact.sourceShortage.map((r) => (
                    <li key={`${r.projectId}|${r.projectRoleId}|${r.shiftId}|${r.date}`}>
                      {r.projectName || lookups.project(r.projectId)}
                      {r.hidden && <span className="text-muted-foreground"> ({L("no access", "nemate pristup", "bez prístupu")})</span>}
                      {" · "}{r.roleTitle || lookups.role(r.projectRoleId)} · {formatIsoDate(r.date, lang)} {r.shiftName || lookups.shift(r.shiftId)} —{" "}
                      {L(`required ${r.required}, available ${r.available}, shortage ${r.deficit}`, `potrebno ${r.required}, dostupno ${r.available}, deficit ${r.deficit}`, `potrebných ${r.required}, k dispozícii ${r.available}, deficit ${r.deficit}`)}
                    </li>
                  ))}
                  {impact.sourceShortage.length === 0 && impact.hiddenProjects.map((h) => (
                    <li key={h.projectId}>
                      {h.projectName} <span className="text-muted-foreground">({L("no access", "nemate pristup", "bez prístupu")})</span>
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 pt-1">
                  <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} aria-label="ack-source-shortage" />
                  <span>{L("I confirm the transfer and the shortage on the source project.", "Potvrđujem premeštaj i manjak na izvornom projektu.", "Potvrdzujem presun a nedostatok na zdrojovom projekte.")}</span>
                </label>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={assign.isPending}>{L("Cancel", "Otkaži", "Zrušiť")}</Button>
          <Button onClick={() => assign.mutate()} disabled={assign.isPending || checking || !validRange || unavailable.length > 0 || (needsAck && !ack)} data-testid="confirm-replacement">
            <UserCheck className="w-4 h-4 mr-1" />{L("Confirm replacement", "Potvrdi zamenu", "Potvrdiť zástup")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
