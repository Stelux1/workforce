// Edit Assignment (§4.5): Job Role, datumi, smena, napomena (update_assignment) i buduće tarife angažmana od
// efektivnog datuma (change_rate / set_rate, uz rates.manage). Sve sa razlogom u revizijskom tragu (audit_log).
// Radnik i projekat se ne menjaju — za to služi Reassign (Transfer / Additional).
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";
import { formatIsoDate } from "@/lib/dateFormat";
import { invalidateAssignmentViews } from "@/components/rates/AssignmentDialog";
import RateField, { emptyRate, rateInput } from "./RateFields";
import { formatRate } from "./AssignmentsTable";

const NONE = "__none";
const SIDES = [
  { key: "b2c", kind: "cost" },
  { key: "b2b", kind: "revenue" },
];

/** Aktivan red tarife angažmana iste vrste koji važi na `date` (za change_rate). */
export function rateRowOn(rows, kind, date) {
  return (rows || [])
    .filter((r) => r.kind === kind && r.status === "active" && r.effective_from <= date && (!r.effective_to || r.effective_to >= date))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0] || null;
}

export function invalidateAssignmentHistory(queryClient, assignment) {
  invalidateAssignmentViews(queryClient, assignment?.project_id);
  queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  queryClient.invalidateQueries({ queryKey: ["assignment-rates"] });
}

export default function EditAssignmentDialog({ open, onOpenChange, assignment, today }) {
  const L = useL();
  const { lang } = useLang();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canRates = Boolean(can?.("rates.manage"));
  const seeB2C = Boolean(can?.("rates.view_b2c"));
  const seeB2B = Boolean(can?.("rates.view_b2b"));
  const [form, setForm] = useState({});
  const [rates, setRates] = useState({ b2c: emptyRate(), b2b: emptyRate() });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const todayIso = today || new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!open || !assignment) return;
    setForm({
      project_role_id: assignment.project_role_id || "",
      start_date: assignment.start_date || "",
      end_date: assignment.end_date || "",
      default_shift_id: assignment.default_shift_id || "",
      notes: assignment.notes || "",
      rate_from: assignment.start_date > todayIso ? assignment.start_date : todayIso,
      reason: "",
    });
    setRates({ b2c: emptyRate(), b2b: emptyRate() });
  }, [open, assignment, todayIso]);

  const projectId = assignment?.project_id;
  const { data: roles = [] } = useQuery({
    queryKey: ["project-roles", projectId],
    queryFn: () => base44.entities.ProjectRole.filter({ project_id: projectId }, "sort"),
    enabled: open && Boolean(projectId),
  });
  const { data: shifts = [] } = useQuery({ queryKey: ["shifts"], queryFn: () => base44.entities.Shift.list("sort", 500), enabled: open });
  const ratesQ = useQuery({
    queryKey: ["assignment-rates", assignment?.id],
    queryFn: () => base44.entities.Rate.filter({ assignment_id: assignment.id, scope: "assignment" }, "-effective_from"),
    enabled: open && Boolean(assignment?.id) && (canRates || seeB2B || seeB2C),
  });
  const activeRoles = roles.filter((r) => r.status === "active" || r.id === form.project_role_id);
  const projectShifts = shifts.filter((s) => (s.active || s.id === form.default_shift_id) && (!s.project_id || s.project_id === projectId));

  const rateChanges = useMemo(
    () => (canRates ? SIDES.map((s) => ({ ...s, input: rateInput(rates[s.key]) })).filter((s) => s.input) : []),
    [canRates, rates]
  );

  const save = useMutation({
    mutationFn: async () => {
      const reason = form.reason.trim() || null;
      const patch = {};
      if (form.project_role_id !== (assignment.project_role_id || "")) patch.project_role_id = form.project_role_id;
      if (form.start_date !== assignment.start_date) patch.start_date = form.start_date;
      if ((form.end_date || null) !== (assignment.end_date || null)) patch.end_date = form.end_date || null;
      if ((form.default_shift_id || null) !== (assignment.default_shift_id || null)) patch.default_shift_id = form.default_shift_id || null;
      if ((form.notes || null) !== (assignment.notes || null)) patch.notes = form.notes || null;
      // Jedan RPC u jednoj transakciji (izmena dodele + tarife od datuma): greška vraća sve, ništa se ne upiše napola.
      await base44.rpc("update_assignment_with_rates", {
        p_id: assignment.id,
        p: patch,
        p_rates: rateChanges.map((side) => ({ kind: side.kind, amount: side.input.amount, currency: side.input.currency })),
        p_rate_from: rateChanges.length > 0 ? form.rate_from : null,
        p_reason: reason,
      });
    },
    onSuccess: () => {
      invalidateAssignmentHistory(queryClient, assignment);
      toast.success(L("Assignment saved", "Angažman sačuvan", "Pridelenie uložené"));
      onOpenChange(false);
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  if (!assignment) return null;
  const changed = form.project_role_id !== (assignment.project_role_id || "") || form.start_date !== assignment.start_date
    || (form.end_date || null) !== (assignment.end_date || null) || (form.default_shift_id || null) !== (assignment.default_shift_id || null)
    || (form.notes || null) !== (assignment.notes || null) || rateChanges.length > 0;
  const reasonOk = (form.reason || "").trim().length >= 5;
  const problem = !form.project_role_id
    ? L("Choose a job role", "Izaberite Job Role", "Vyberte pracovnú rolu")
    : !form.start_date
      ? L("The start date is required", "Datum početka je obavezan", "Dátum začiatku je povinný")
      : form.end_date && form.end_date < form.start_date
        ? L("The end date can't be before the start date.", "Datum završetka ne može biti pre datuma početka.", "Dátum ukončenia nemôže byť pred dátumom začiatku.")
        : rateChanges.length > 0 && (!form.rate_from || form.rate_from < form.start_date || (form.end_date && form.rate_from > form.end_date))
          ? L("The rate change date must be within the assignment", "Datum promene tarife mora biti u okviru angažmana", "Dátum zmeny sadzby musí byť v rámci pridelenia")
          : rateChanges.length > 0 && !reasonOk
            ? L("A rate change needs a reason (at least 5 characters)", "Promena tarife traži razlog (najmanje 5 znakova)", "Zmena sadzby vyžaduje dôvod (aspoň 5 znakov)")
            : !changed
              ? L("Nothing changed yet", "Još ništa nije promenjeno", "Zatiaľ bez zmien")
              : null;

  const currentLabel = (kind) => {
    const row = rateRowOn(ratesQ.data, kind, form.rate_from || todayIso);
    if (!row) return L("No assignment rate — the job role's rate applies", "Nema tarife angažmana — važi tarifa Job Role", "Bez sadzby pridelenia — platí sadzba roly");
    return L(`Now ${formatRate({ rate: row.amount, currency: row.currency }, lang)} since ${formatIsoDate(row.effective_from, lang)}`,
      `Sada ${formatRate({ rate: row.amount, currency: row.currency }, lang)} od ${formatIsoDate(row.effective_from, lang)}`,
      `Teraz ${formatRate({ rate: row.amount, currency: row.currency }, lang)} od ${formatIsoDate(row.effective_from, lang)}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{L("Edit assignment", "Izmena angažmana", "Upraviť pridelenie")}</DialogTitle>
          <DialogDescription>
            {assignment.employeeName || assignment.employee_name} · {assignment.projectName || assignment.project_name}
            {" — "}
            {L("Changes apply at once on the project's Workers tab, in Workforce Planning and in reports.",
              "Izmene se odmah vide na kartici Radnici projekta, u Workforce Planning-u i u izveštajima.",
              "Zmeny sa hneď prejavia na karte Pracovníci projektu, v plánovaní a v prehľadoch.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{L("Job role", "Job Role", "Pracovná rola")} *</Label>
            <Select value={form.project_role_id || ""} onValueChange={(v) => set("project_role_id", v)}>
              <SelectTrigger><SelectValue placeholder={L("Select job role", "Izaberite Job Role", "Vyberte pracovnú rolu")} /></SelectTrigger>
              <SelectContent>{activeRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{L("Planned shift", "Planirana smena", "Plánovaná zmena")}</Label>
            <Select value={form.default_shift_id || NONE} onValueChange={(v) => set("default_shift_id", v === NONE ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{L("No planned shift", "Bez planirane smene", "Bez plánovanej zmeny")}</SelectItem>
                {projectShifts.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{`${s.code} · ${s.name} (${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)})`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{L("Start date", "Datum početka", "Dátum začiatku")} *</Label>
            <Input type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{L("End date", "Datum završetka", "Dátum ukončenia")}</Label>
            <Input type="date" value={form.end_date || ""} min={form.start_date} onChange={(e) => set("end_date", e.target.value)} />
            <p className="text-xs text-muted-foreground">{L("Empty = open-ended. Days with recorded hours must stay inside.", "Prazno = bez kraja. Dani sa unetim satima moraju ostati unutra.", "Prázdne = na neurčito. Dni so zapísanými hodinami musia ostať vnútri.")}</p>
          </div>

          {canRates && (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3 sm:col-span-2">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{L("Future rates", "Buduće tarife", "Budúce sadzby")}</p>
                  <p className="text-xs text-muted-foreground">
                    {L("New price from the effective date; the old rate ends the day before. Approved timesheets keep their rates.",
                      "Nova cena od datuma važenja; stara tarifa se završava dan ranije. Odobrene satnice zadržavaju svoje tarife.",
                      "Nová cena od dátumu platnosti; stará sadzba končí deň predtým. Schválené výkazy si ponechajú svoje sadzby.")}
                  </p>
                </div>
                <div className="w-40 space-y-1">
                  <Label className="text-xs">{L("Effective from", "Važi od", "Platí od")}</Label>
                  <Input type="date" value={form.rate_from || ""} min={form.start_date} max={form.end_date || undefined} onChange={(e) => set("rate_from", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <RateField id="edit-b2c" label={L("New B2C rate (worker, per hour)", "Nova B2C tarifa (radnik, po satu)", "Nová sadzba B2C (pracovník, za hodinu)")}
                  hint={ratesQ.isLoading ? "…" : currentLabel("cost")} value={rates.b2c} onChange={(v) => setRates((p) => ({ ...p, b2c: v }))} />
                <RateField id="edit-b2b" label={L("New B2B exception (client, per hour)", "Novi B2B izuzetak (klijent, po satu)", "Nová výnimka B2B (klient, za hodinu)")}
                  hint={ratesQ.isLoading ? "…" : currentLabel("revenue")} value={rates.b2b} onChange={(v) => setRates((p) => ({ ...p, b2b: v }))} />
              </div>
            </div>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{L("Notes", "Napomena", "Poznámka")}</Label>
            <Textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{L("Reason for the change", "Razlog izmene", "Dôvod zmeny")}{rateChanges.length > 0 ? " *" : ""}</Label>
            <Input value={form.reason || ""} onChange={(e) => set("reason", e.target.value)} />
            <p className="text-xs text-muted-foreground">{L("Saved in the assignment's history.", "Čuva se u istoriji angažmana.", "Uloží sa do histórie pridelenia.")}</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {problem && <p className="mr-auto self-center text-xs text-muted-foreground">{problem}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("Cancel", "Odustani", "Zrušiť")}</Button>
          <Button onClick={() => save.mutate()} disabled={Boolean(problem) || save.isPending}>
            {save.isPending ? L("Saving...", "Čuvanje...", "Ukladá sa...") : L("Save", "Sačuvaj", "Uložiť")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
