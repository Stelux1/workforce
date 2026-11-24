// Required Workforce (spec §13.03): potreban broj radnika po projektu, Job Role-u i smeni za period.
// Čuva se preko `set_workforce_requirement`: broj se menja OD izabranog datuma (raniji dani ostaju sa starim brojem, T20).
import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useL } from "@/lib/translations";
import { shiftTitle } from "./common";

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export default function RequirementDialog({ open, onClose, projects, roles, shifts, requirements, projectId, requirement, defaults, onSaved }) {
  const L = useL();
  const editing = !!requirement;
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (requirement) {
      setForm({
        project_id: requirement.project_id,
        project_role_id: requirement.project_role_id,
        shift_id: requirement.shift_id,
        from: clamp(todayIso(), requirement.date_from, requirement.date_to),
        to: "",
        count: String(requirement.required_count),
        notes: requirement.notes || "",
      });
    } else {
      setForm({
        project_id: projectId || defaults?.project_id || "",
        project_role_id: defaults?.project_role_id || "",
        shift_id: defaults?.shift_id || "",
        from: defaults?.from || todayIso(),
        to: defaults?.to || "",
        count: "1",
        notes: "",
      });
    }
  }, [open, requirement, projectId, defaults]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const projectRoles = useMemo(() => roles.filter((r) => r.project_id === form.project_id && r.status !== "inactive"), [roles, form.project_id]);
  const projectShifts = useMemo(() => shifts.filter((s) => s.active !== false && (!s.project_id || s.project_id === form.project_id)), [shifts, form.project_id]);

  // „Do" se može izostaviti samo kad za tu ulogu i smenu već postoji period koji pokriva datum „od" (server isto traži).
  const existing = useMemo(
    () => requirements.find((q) => q.project_role_id === form.project_role_id && q.shift_id === form.shift_id && form.from >= q.date_from && form.from <= q.date_to) || null,
    [requirements, form.project_role_id, form.shift_id, form.from]
  );

  const validation = (() => {
    if (!form.project_id) return L("Choose a project.", "Izaberite projekat.", "Vyberte projekt.");
    if (!form.project_role_id) return L("Choose a Job Role.", "Izaberite Job Role.", "Vyberte Job Role.");
    if (!form.shift_id) return L("Choose a shift.", "Izaberite smenu.", "Vyberte zmenu.");
    if (!form.from) return L("Enter the start date.", "Unesite datum „od“.", "Zadajte dátum „od“.");
    if (!/^\d+$/.test(String(form.count).trim())) return L("Required workers must be a whole number, 0 or more.", "Potreban broj mora biti ceo broj, 0 ili više.", "Potrebný počet musí byť celé číslo, 0 alebo viac.");
    if (form.to && form.to < form.from) return L("The end date is before the start date.", "Datum „do“ je pre datuma „od“.", "Dátum „do“ je pred dátumom „od“.");
    if (!form.to && !existing) return L("Enter the end date for a new period.", "Za novi period unesite i datum „do“.", "Pre nové obdobie zadajte aj dátum „do“.");
    return null;
  })();

  const save = useMutation({
    mutationFn: () =>
      base44.rpc("set_workforce_requirement", {
        p_role: form.project_role_id,
        p_shift: form.shift_id,
        p_from: form.from,
        p_to: form.to || null,
        p_count: Number(form.count),
        p_note: form.notes?.trim() || null,
      }),
    onSuccess: () => {
      toast.success(L("Required workforce saved", "Potreban broj radnika je sačuvan", "Potrebný počet pracovníkov bol uložený"));
      onSaved?.();
      onClose();
    },
    onError: (e) => setError(e),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? L("Change required workforce", "Izmena potrebnog broja radnika", "Zmena potrebného počtu pracovníkov") : L("Add required workforce", "Dodaj potreban broj radnika", "Pridať potrebný počet pracovníkov")}</DialogTitle>
          <DialogDescription>
            {L(
              "The number applies from the chosen date. Earlier days keep the previous number.",
              "Broj važi od izabranog datuma. Raniji dani ostaju sa prethodnim brojem.",
              "Počet platí od zvoleného dátumu. Skoršie dni zostanú s predchádzajúcim počtom."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {!projectId && (
            <div className="grid gap-1.5">
              <Label>{L("Project", "Projekat", "Projekt")}</Label>
              <Select value={form.project_id || ""} disabled={editing} onValueChange={(v) => set({ project_id: v, project_role_id: "", shift_id: "" })}>
                <SelectTrigger><SelectValue placeholder={L("Choose a project", "Izaberite projekat", "Vyberte projekt")} /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Job Role</Label>
              <Select value={form.project_role_id || ""} disabled={editing || !form.project_id} onValueChange={(v) => set({ project_role_id: v })}>
                <SelectTrigger><SelectValue placeholder={projectRoles.length || !form.project_id ? L("Choose a Job Role", "Izaberite Job Role", "Vyberte Job Role") : L("No Job Roles", "Nema Job Role-ova", "Žiadne Job Role")} /></SelectTrigger>
                <SelectContent>{projectRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{L("Shift", "Smena", "Zmena")}</Label>
              <Select value={form.shift_id || ""} disabled={editing || !form.project_id} onValueChange={(v) => set({ shift_id: v })}>
                <SelectTrigger><SelectValue placeholder={projectShifts.length || !form.project_id ? L("Choose a shift", "Izaberite smenu", "Vyberte zmenu") : L("No shifts defined", "Nema definisanih smena", "Žiadne zmeny")} /></SelectTrigger>
                <SelectContent>{projectShifts.map((s) => <SelectItem key={s.id} value={s.id}>{shiftTitle(s)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="wf-from">{editing ? L("Applies from", "Važi od", "Platí od") : L("From", "Od", "Od")}</Label>
              <Input id="wf-from" type="date" value={form.from || ""} min={editing ? requirement.date_from : undefined} max={editing ? requirement.date_to : undefined} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wf-to">{L("To", "Do", "Do")}</Label>
              <Input id="wf-to" type="date" value={form.to || ""} min={form.from || undefined} onChange={(e) => set({ to: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wf-count">{L("Required workers", "Potrebno radnika", "Potrebných pracovníkov")}</Label>
              <Input id="wf-count" inputMode="numeric" value={form.count ?? ""} onChange={(e) => set({ count: e.target.value })} />
            </div>
          </div>
          {existing && !form.to && (
            <p className="text-xs text-muted-foreground">
              {L("Applies until the end of the existing period", "Važi do kraja postojećeg perioda", "Platí do konca existujúceho obdobia")} ({existing.date_to}).
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="wf-notes">{L("Note", "Napomena", "Poznámka")}</Label>
            <Textarea id="wf-notes" rows={2} value={form.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          {validation && form.project_id && <p className="text-xs text-warning" data-testid="requirement-validation">{validation}</p>}
          {error && <p role="alert" className="text-sm text-destructive">{describeError(error)}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{L("Cancel", "Odustani", "Zrušiť")}</Button>
          <Button onClick={() => save.mutate()} disabled={!!validation || save.isPending}>
            {save.isPending ? L("Saving…", "Čuvanje…", "Ukladá sa…") : L("Save", "Sačuvaj", "Uložiť")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
