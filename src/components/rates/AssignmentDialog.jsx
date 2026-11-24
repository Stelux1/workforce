import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const LABELS = {
  en: {
    add: "Add Assignment", edit: "Edit Assignment", employee: "Employee", project: "Project",
    position: "Role on project", start: "Assignment Start", end: "Assignment End", open: "empty = open-ended",
    status: "Status", planned: "Planned", active: "Active", completed: "Completed", cancelled: "Cancelled",
    reference: "Contract / rate reference", notes: "Notes", save: "Save", cancel: "Cancel",
    selectEmployee: "Select employee", selectProject: "Select project",
    vendorAtStart: "Engagement on start date",
  },
  rs: {
    add: "Nova dodjela", edit: "Uredi dodjelu", employee: "Zaposleni", project: "Projekat",
    position: "Radno mesto na projektu", start: "Početak dodjele", end: "Kraj dodjele", open: "prazno = neograničeno",
    status: "Status", planned: "Planirano", active: "Aktivno", completed: "Završeno", cancelled: "Otkazano",
    reference: "Ugovor / referenca tarife", notes: "Napomene", save: "Sačuvaj", cancel: "Otkaži",
    selectEmployee: "Izaberite zaposlenog", selectProject: "Izaberite projekat",
    vendorAtStart: "Angažovanje na datum početka",
  },
  sk: {
    add: "Pridať pridelenie", edit: "Upraviť pridelenie", employee: "Zamestnanec", project: "Projekt",
    position: "Rola na projekte", start: "Začiatok pridelenia", end: "Koniec pridelenia", open: "prázdne = na neurčito",
    status: "Stav", planned: "Plánované", active: "Aktívne", completed: "Dokončené", cancelled: "Zrušené",
    reference: "Zmluva / odkaz na sadzbu", notes: "Poznámky", save: "Uložiť", cancel: "Zrušiť",
    selectEmployee: "Vyberte zamestnanca", selectProject: "Vyberte projekt",
    vendorAtStart: "Pracovný vzťah k dátumu začiatku",
  },
};

export default function AssignmentDialog({ open, onOpenChange, form, setForm, onSave, saving, employees = [], projects = [], affiliationLabel, lang }) {
  const L = LABELS[lang] || LABELS.en;
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{form.id ? L.edit : L.add}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{L.employee} *</Label>
            <Select value={form.employee_id || ""} onValueChange={(v) => set("employee_id", v)}>
              <SelectTrigger><SelectValue placeholder={L.selectEmployee} /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{`${e.last_name || ""} ${e.first_name || ""}`.trim()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{L.project} *</Label>
            <Select value={form.project_id || ""} onValueChange={(v) => set("project_id", v)}>
              <SelectTrigger><SelectValue placeholder={L.selectProject} /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 col-span-2">
            <Label>{L.position}</Label>
            <Input placeholder="e.g. Mason" value={form.position || ""} onChange={(e) => set("position", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.start} *</Label>
            <Input type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.end}</Label>
            <Input type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} placeholder={L.open} />
          </div>
          <div className="space-y-2">
            <Label>{L.status}</Label>
            <Select value={form.status || "active"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">{L.planned}</SelectItem>
                <SelectItem value="active">{L.active}</SelectItem>
                <SelectItem value="completed">{L.completed}</SelectItem>
                <SelectItem value="cancelled">{L.cancelled}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{L.reference}</Label>
            <Input value={form.rate_reference || ""} onChange={(e) => set("rate_reference", e.target.value)} />
          </div>
          {affiliationLabel && (
            <div className="col-span-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-2">{L.vendorAtStart}</span>
              {affiliationLabel}
            </div>
          )}
          <div className="space-y-2 col-span-2">
            <Label>{L.notes}</Label>
            <Textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L.cancel}</Button>
          <Button onClick={onSave} disabled={saving}>{L.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}