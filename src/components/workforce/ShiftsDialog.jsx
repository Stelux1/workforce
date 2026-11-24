// Smene (shifts): šifra, naziv, od–do (kraj ≤ početak = prelazi ponoć). Globalne ili vezane za projekat.
// Pravo menja baza (`workforce.manage`); neaktivna smena ostaje u istoriji, a brisanje odbija baza ako se koristi.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Moon, Pencil, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { describeError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useL } from "@/lib/translations";
import { hhmm } from "./common";

const GLOBAL = "__global__";
const empty = (projectId) => ({ id: null, code: "", name: "", start_time: "06:00", end_time: "14:00", project_id: projectId || GLOBAL, active: true });

export default function ShiftsDialog({ open, onClose, shifts, projects, projectId, canManage, onChanged }) {
  const L = useL();
  const [form, setForm] = useState(() => empty(projectId));
  const [error, setError] = useState(null);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const visible = shifts.filter((s) => !projectId || !s.project_id || s.project_id === projectId);
  const projectName = (id) => projects.find((p) => p.id === id)?.name;

  const crosses = form.start_time && form.end_time && form.end_time <= form.start_time;
  const invalid =
    !form.code.trim() || !form.name.trim() || !form.start_time || !form.end_time || form.start_time === form.end_time;

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        start_time: form.start_time,
        end_time: form.end_time,
        project_id: form.project_id === GLOBAL ? null : form.project_id,
        active: form.active,
      };
      return form.id ? base44.entities.Shift.update(form.id, payload) : base44.entities.Shift.create(payload);
    },
    onSuccess: () => {
      toast.success(L("Shift saved", "Smena je sačuvana", "Zmena bola uložená"));
      setForm(empty(projectId));
      setError(null);
      onChanged?.();
    },
    onError: (e) => setError(e),
  });

  const remove = useMutation({
    mutationFn: (id) => base44.entities.Shift.delete(id),
    onSuccess: () => {
      toast.success(L("Shift removed", "Smena je uklonjena", "Zmena bola odstránená"));
      onChanged?.();
    },
    onError: (e) => toast.error(describeError(e)),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{L("Shifts", "Smene", "Zmeny")}</DialogTitle>
          <DialogDescription>
            {L(
              "A shift whose end is not after its start runs past midnight into the next day.",
              "Smena čiji kraj nije posle početka prelazi ponoć u sledeći dan.",
              "Zmena, ktorej koniec nie je po začiatku, prechádza cez polnoc do ďalšieho dňa."
            )}
          </DialogDescription>
        </DialogHeader>

        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground" data-testid="shifts-empty">
            {L("No shifts yet. Add the first one below; required workforce is defined per shift.", "Još nema smena. Dodajte prvu ispod; potreban broj radnika se zadaje po smeni.", "Zatiaľ nie sú žiadne zmeny. Pridajte prvú nižšie; potrebný počet pracovníkov sa zadáva podľa zmeny.")}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {visible.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="font-mono text-xs rounded bg-muted px-1.5 py-0.5">{s.code}</span>
                <span className="font-medium">{s.name}</span>
                <span className="text-muted-foreground tabular-nums">{hhmm(s.start_time)}–{hhmm(s.end_time)}</span>
                {s.crosses_midnight && <Moon className="h-3.5 w-3.5 text-muted-foreground" aria-label={L("Past midnight", "Preko ponoći", "Cez polnoc")} />}
                <span className="text-xs text-muted-foreground truncate">{s.project_id ? projectName(s.project_id) : L("All projects", "Svi projekti", "Všetky projekty")}</span>
                {s.active === false && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{L("Inactive", "Neaktivna", "Neaktívna")}</span>}
                <span className="ml-auto flex shrink-0">
                  {canManage && (
                    <>
                      <Button variant="ghost" size="icon" aria-label={L("Edit", "Izmeni", "Upraviť")}
                        onClick={() => { setError(null); setForm({ id: s.id, code: s.code, name: s.name, start_time: hhmm(s.start_time), end_time: hhmm(s.end_time), project_id: s.project_id || GLOBAL, active: s.active !== false }); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label={L("Delete", "Obriši", "Vymazať")} onClick={() => remove.mutate(s.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {canManage ? (
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-medium">{form.id ? L("Edit shift", "Izmena smene", "Úprava zmeny") : L("New shift", "Nova smena", "Nová zmena")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="sh-code">{L("Code", "Šifra", "Kód")}</Label>
                <Input id="sh-code" value={form.code} maxLength={12} onChange={(e) => set({ code: e.target.value })} placeholder="D" />
              </div>
              <div className="grid gap-1.5 col-span-1 sm:col-span-3">
                <Label htmlFor="sh-name">{L("Name", "Naziv", "Názov")}</Label>
                <Input id="sh-name" value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder={L("Morning", "Prva smena", "Ranná")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sh-start">{L("From", "Od", "Od")}</Label>
                <Input id="sh-start" type="time" value={form.start_time} onChange={(e) => set({ start_time: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sh-end">{L("To", "Do", "Do")}</Label>
                <Input id="sh-end" type="time" value={form.end_time} onChange={(e) => set({ end_time: e.target.value })} />
              </div>
              <div className="grid gap-1.5 col-span-2">
                <Label>{L("Applies to", "Važi za", "Platí pre")}</Label>
                <Select value={form.project_id} onValueChange={(v) => set({ project_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLOBAL}>{L("All projects", "Svi projekti", "Všetky projekty")}</SelectItem>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} />
                {L("Active", "Aktivna", "Aktívna")}
                {crosses && <span className="text-xs text-muted-foreground">· {L("runs past midnight", "prelazi ponoć", "prechádza cez polnoc")}</span>}
              </label>
              <div className="flex gap-2">
                {form.id && <Button variant="outline" onClick={() => { setForm(empty(projectId)); setError(null); }}>{L("Cancel edit", "Odustani od izmene", "Zrušiť úpravu")}</Button>}
                <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>{form.id ? L("Save", "Sačuvaj", "Uložiť") : L("Add shift", "Dodaj smenu", "Pridať zmenu")}</Button>
              </div>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{describeError(error)}</p>}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{L("You can view shifts but not change them.", "Smene možete da pregledate, ali ne i da menjate.", "Zmeny môžete zobraziť, ale nie upravovať.")}</p>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>{L("Close", "Zatvori", "Zavrieť")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
