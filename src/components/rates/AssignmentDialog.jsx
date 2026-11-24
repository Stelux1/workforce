// Add / Edit Assignment i End / Cancel (spec §4.5, docs/TEAMORA-DATA-MODEL.md §2.4). Sve ide kroz RPC-ove u bazi
// (create_assignment, update_assignment, end_assignment, cancel_assignment): baza proverava prava (assignments.manage,
// rates.manage za tarife), preklapanje i dane sa satima. Isti dijalog koriste Project → Workers i Tarife i dodele.
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
import { useAuth } from "@/lib/AuthContext";
import { CURRENCIES, resolveAffiliation } from "@/lib/rateEngine";
import { negativeLabourMargin } from "@/lib/projectSite";
import NegativeMarginNote from "@/components/projects/NegativeMarginNote";

const NONE = "__none";
const today = () => new Date().toISOString().slice(0, 10);
const nameOf = (e) => `${e?.last_name || ""} ${e?.first_name || ""}`.trim();

/** Posle svake izmene dodele osvežavaju se svi pogledi na istu evidenciju (projekat, /rates, Workforce, Onboarding). */
export function invalidateAssignmentViews(queryClient, projectId) {
  for (const queryKey of [["project-assignments"], ["rates"], ["projects"], ["project", projectId], ["project-roles"]]) {
    queryClient.invalidateQueries({ queryKey });
  }
}

function RateInput({ label, hint, value, onChange }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input type="number" min="0" step="0.01" inputMode="decimal" value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })} className="flex-1" />
        <Select value={value.currency} onValueChange={(currency) => onChange({ ...value, currency })}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * @param {object} props
 * @param {object|null} props.assignment  postojeća dodela (Edit) ili null (Add)
 * @param {object} [props.project]        fiksiran projekat (Project → Workers); bez njega se bira iz `projects`
 */
export default function AssignmentDialog({ open, onOpenChange, assignment, project, projects = [], employees = [], history = [] }) {
  const L = useL();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canRates = can?.("rates.manage");
  const editing = Boolean(assignment?.id);
  const [form, setForm] = useState({});
  const [b2c, setB2c] = useState({ amount: "", currency: "EUR" });
  const [b2b, setB2b] = useState({ amount: "", currency: "EUR" });

  useEffect(() => {
    if (!open) return;
    setForm({
      employee_id: assignment?.employee_id || "",
      project_id: assignment?.project_id || project?.id || "",
      project_role_id: assignment?.project_role_id || "",
      start_date: assignment?.start_date || today(),
      end_date: assignment?.end_date || "",
      default_shift_id: assignment?.default_shift_id || "",
      notes: assignment?.notes || "",
    });
    setB2c({ amount: "", currency: "EUR" });
    setB2b({ amount: "", currency: "EUR" });
  }, [open, assignment, project]);

  const projectId = form.project_id;
  const { data: roles = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["project-roles", projectId],
    queryFn: () => base44.entities.ProjectRole.filter({ project_id: projectId }, "sort"),
    enabled: open && Boolean(projectId),
  });
  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => base44.entities.Shift.list("sort", 500),
    enabled: open,
  });
  const activeRoles = roles.filter((r) => r.status === "active" || r.id === form.project_role_id);
  const projectShifts = shifts.filter((s) => (s.active || s.id === form.default_shift_id) && (!s.project_id || s.project_id === projectId));
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const affiliation = useMemo(
    () => (form.employee_id && form.start_date ? resolveAffiliation({ history, employeeId: form.employee_id, date: form.start_date }) : null),
    [history, form.employee_id, form.start_date]
  );

  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        return base44.rpc("update_assignment", {
          p_id: assignment.id,
          p: {
            project_role_id: form.project_role_id,
            start_date: form.start_date,
            end_date: form.end_date || null,
            default_shift_id: form.default_shift_id || null,
            notes: form.notes || null,
          },
          p_reason: null,
        });
      }
      const rate = (r) => (Number(r.amount) > 0 ? { amount: Number(r.amount), currency: r.currency } : null);
      return base44.rpc("create_assignment", {
        p: {
          employee_id: form.employee_id,
          project_id: form.project_id,
          project_role_id: form.project_role_id,
          start_date: form.start_date,
          end_date: form.end_date || null,
          default_shift_id: form.default_shift_id || null,
          notes: form.notes || null,
          ...(canRates ? { b2c: rate(b2c), b2b: rate(b2b) } : {}),
        },
      });
    },
    onSuccess: () => {
      invalidateAssignmentViews(queryClient, form.project_id);
      toast.success(editing ? L("Assignment saved", "Dodela sačuvana", "Pridelenie uložené") : L("Employee assigned", "Radnik je dodeljen", "Zamestnanec pridelený"));
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const problem = !form.employee_id
    ? L("Choose an employee", "Izaberite radnika", "Vyberte zamestnanca")
    : !form.project_id
      ? L("Choose a project", "Izaberite projekat", "Vyberte projekt")
      : !form.project_role_id
        ? L("Choose a job role", "Izaberite Job Role", "Vyberte pracovnú rolu")
        : !form.start_date
          ? L("The start date is required", "Datum početka je obavezan", "Dátum začiatku je povinný")
          : form.end_date && form.end_date < form.start_date
            ? L("The end date can't be before the start date.", "Datum završetka ne može biti pre datuma početka.", "Dátum ukončenia nemôže byť pred dátumom začiatku.")
            : null;
  const sameCurrency = b2c.currency === b2b.currency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? L("Edit assignment", "Izmena dodele", "Upraviť pridelenie") : L("Add assignment", "Nova dodela", "Pridať pridelenie")}</DialogTitle>
          <DialogDescription>
            {editing
              ? L("Change the job role, dates, shift or note. Employee and project stay the same — use End and a new assignment instead.",
                  "Menjaju se Job Role, datumi, smena i napomena. Radnik i projekat ostaju isti — za to završite dodelu i napravite novu.",
                  "Mení sa pracovná rola, dátumy, zmena a poznámka. Zamestnanec a projekt ostávajú — na to ukončite pridelenie a vytvorte nové.")
              : L("The assignment appears at once on the project's Workers tab, in Rates & Assignments and in planning.",
                  "Dodela se odmah vidi na kartici Radnici projekta, u Tarifama i dodelama i u planiranju.",
                  "Pridelenie sa hneď zobrazí na karte Pracovníci projektu, v Sadzbách a prideleniach aj v plánovaní.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{L("Employee", "Radnik", "Zamestnanec")} *</Label>
            <Select value={form.employee_id || ""} onValueChange={(v) => set("employee_id", v)} disabled={editing}>
              <SelectTrigger><SelectValue placeholder={L("Select employee", "Izaberite radnika", "Vyberte zamestnanca")} /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{nameOf(e)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{L("Project", "Projekat", "Projekt")} *</Label>
            {project ? (
              <Input value={project.name} disabled />
            ) : (
              <Select value={form.project_id || ""} onValueChange={(v) => setForm((p) => ({ ...p, project_id: v, project_role_id: "", default_shift_id: "" }))} disabled={editing}>
                <SelectTrigger><SelectValue placeholder={L("Select project", "Izaberite projekat", "Vyberte projekt")} /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>{L("Job role", "Job Role", "Pracovná rola")} *</Label>
            <Select value={form.project_role_id || ""} onValueChange={(v) => set("project_role_id", v)} disabled={!projectId || rolesLoading}>
              <SelectTrigger><SelectValue placeholder={L("Select job role", "Izaberite Job Role", "Vyberte pracovnú rolu")} /></SelectTrigger>
              <SelectContent>
                {activeRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
              </SelectContent>
            </Select>
            {projectId && !rolesLoading && activeRoles.length === 0 && (
              <p className="text-xs text-warning">
                {L("The project has no job roles yet — add one on the project's Overview tab.", "Projekat još nema Job Role — dodajte ga na kartici Pregled projekta.", "Projekt zatiaľ nemá pracovné roly — pridajte ju na karte Prehľad projektu.")}
              </p>
            )}
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
            <Input type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} />
            <p className="text-xs text-muted-foreground">{L("Empty = open-ended", "Prazno = bez kraja", "Prázdne = na neurčito")}</p>
          </div>

          {!editing && affiliation && (
            <div className="sm:col-span-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-2">
                {L("Payee on the start date", "Primalac isplate na datum početka", "Príjemca platby k dátumu začiatku")}
              </span>
              {affiliation.engagement_type === "subcontractor_worker"
                ? `${affiliation.vendor_name || "—"} (${L("vendor", "dobavljač", "dodávateľ")})`
                : L("Direct employee", "Direktno zaposlen", "Priamy zamestnanec")}
            </div>
          )}

          {!editing && canRates && (
            <>
              <RateInput label={L("B2C rate (worker, per hour)", "B2C tarifa (radnik, po satu)", "Sadzba B2C (pracovník, za hodinu)")}
                hint={L("Empty = the job role's B2C applies.", "Prazno = važi B2C Job Role.", "Prázdne = platí B2C pracovnej roly.")} value={b2c} onChange={setB2c} />
              <RateInput label={L("B2B exception (client, per hour)", "B2B izuzetak (klijent, po satu)", "Výnimka B2B (klient, za hodinu)")}
                hint={L("Only if this assignment is billed differently from the job role.", "Samo ako se ova dodela naplaćuje drugačije od Job Role.", "Iba ak sa toto pridelenie fakturuje inak ako pracovná rola.")} value={b2b} onChange={setB2b} />
              {sameCurrency && negativeLabourMargin(Number(b2c.amount) || null, Number(b2b.amount) || null) && (
                <div className="sm:col-span-2"><NegativeMarginNote L={L} /></div>
              )}
            </>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label>{L("Notes", "Napomena", "Poznámka")}</Label>
            <Textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          {problem && <p className="text-xs text-muted-foreground mr-auto self-center">{problem}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("Cancel", "Odustani", "Zrušiť")}</Button>
          <Button onClick={() => save.mutate()} disabled={Boolean(problem) || save.isPending}>
            {save.isPending ? L("Saving...", "Čuvanje...", "Ukladá sa...") : L("Save", "Sačuvaj", "Uložiť")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * End Assignment (kraj od datuma, ne pre poslednjeg dana rada) ili Cancel (poništenje dodele bez rada).
 * @param {"end"|"cancel"} props.mode
 */
export function EndAssignmentDialog({ open, onOpenChange, assignment, mode = "end" }) {
  const L = useL();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setDate(assignment?.end_date || today());
      setReason("");
    }
  }, [open, assignment]);

  const run = useMutation({
    mutationFn: () =>
      mode === "end"
        ? base44.rpc("end_assignment", { p_id: assignment.id, p_end_date: date, p_reason: reason })
        : base44.rpc("cancel_assignment", { p_id: assignment.id, p_reason: reason }),
    onSuccess: () => {
      invalidateAssignmentViews(queryClient, assignment.project_id);
      toast.success(mode === "end" ? L("Assignment ended", "Dodela je završena", "Pridelenie ukončené") : L("Assignment cancelled", "Dodela je poništena", "Pridelenie zrušené"));
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const reasonOk = reason.trim().length >= 5;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "end" ? L("End assignment", "Završi dodelu", "Ukončiť pridelenie") : L("Cancel assignment", "Poništi dodelu", "Zrušiť pridelenie")}</DialogTitle>
          <DialogDescription>
            {assignment?.employee_name} · {assignment?.project_name}
            {" — "}
            {mode === "end"
              ? L("Earlier timesheets, payroll and reports stay unchanged. Open assignment rates end on the same day.",
                  "Raniji sati, obračuni i izveštaji ostaju isti. Otvorene tarife dodele se završavaju istog dana.",
                  "Skoršie výkazy, zúčtovania a prehľady ostávajú. Otvorené sadzby pridelenia končia v ten istý deň.")
              : L("Only an assignment without recorded hours can be cancelled; it then never applies.",
                  "Poništava se samo dodela bez unetih sati; posle toga nikad ne važi.",
                  "Zrušiť možno iba pridelenie bez zapísaných hodín; potom nikdy neplatí.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {mode === "end" && (
            <div className="space-y-1.5">
              <Label>{L("Last day of the assignment", "Poslednji dan dodele", "Posledný deň pridelenia")} *</Label>
              <Input type="date" value={date} min={assignment?.start_date} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>{L("Reason", "Razlog", "Dôvod")} *</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs text-muted-foreground">{L("At least 5 characters; saved in the audit trail.", "Najmanje 5 znakova; čuva se u istoriji izmena.", "Aspoň 5 znakov; uloží sa do histórie zmien.")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L("Back", "Nazad", "Späť")}</Button>
          <Button variant={mode === "cancel" ? "destructive" : "default"} onClick={() => run.mutate()} disabled={!reasonOk || (mode === "end" && !date) || run.isPending}>
            {mode === "end" ? L("End assignment", "Završi dodelu", "Ukončiť pridelenie") : L("Cancel assignment", "Poništi dodelu", "Zrušiť pridelenie")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
