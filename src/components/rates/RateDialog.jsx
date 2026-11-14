import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CURRENCIES, RATE_LABELS, RATE_UNITS } from "@/lib/rateEngine";

const LABELS = {
  en: {
    add: "Add Rate", edit: "Edit Rate", scope: "Applies To", assignment: "Specific assignment",
    project: "Project / role", employee: "Employee default", kind: "Type", cost: "Cost (payable)",
    revenue: "Revenue (billable)", employeeName: "Employee", projectName: "Project", position: "Role / position",
    assignmentName: "Assignment", unit: "Rate Unit", amount: "Amount", currency: "Currency",
    from: "Effective From", to: "Effective To", open: "empty = open-ended", status: "Status",
    active: "Active", inactive: "Inactive", notes: "Notes", save: "Save", cancel: "Cancel",
    selectEmployee: "Select employee", selectProject: "Select project", selectAssignment: "Select assignment",
  },
  rs: {
    add: "Nova tarifa", edit: "Uredi tarifu", scope: "Primenjuje se na", assignment: "Konkretna dodjela",
    project: "Projekat / radno mesto", employee: "Podrazumevano za zaposlenog", kind: "Tip", cost: "Trošak (za isplatu)",
    revenue: "Prihod (za fakturisanje)", employeeName: "Zaposleni", projectName: "Projekat", position: "Radno mesto",
    assignmentName: "Dodjela", unit: "Jedinica tarife", amount: "Iznos", currency: "Valuta",
    from: "Važi od", to: "Važi do", open: "prazno = neograničeno", status: "Status",
    active: "Aktivna", inactive: "Neaktivna", notes: "Napomene", save: "Sačuvaj", cancel: "Otkaži",
    selectEmployee: "Izaberite zaposlenog", selectProject: "Izaberite projekat", selectAssignment: "Izaberite dodjelu",
  },
};

export default function RateDialog({ open, onOpenChange, form, setForm, onSave, saving, employees = [], projects = [], assignments = [], lang }) {
  const L = LABELS[lang] || LABELS.en;
  const R = RATE_LABELS[lang] || RATE_LABELS.en;
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));
  const scope = form.scope || "project";

  const changeScope = (value) => {
    setForm((p) => ({
      ...p,
      scope: value,
      employee_id: value === "project" ? "" : p.employee_id,
      project_id: value === "employee" ? "" : p.project_id,
      assignment_id: value === "assignment" ? p.assignment_id : "",
      position: value === "project" ? p.position : "",
    }));
  };

  const pickAssignment = (id) => {
    const a = assignments.find((x) => x.id === id);
    setForm((p) => ({
      ...p,
      assignment_id: id,
      employee_id: a?.employee_id || p.employee_id,
      project_id: a?.project_id || p.project_id,
      position: a?.position || p.position,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? L.edit : L.add}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{L.scope} *</Label>
            <Select value={scope} onValueChange={changeScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="assignment">{L.assignment}</SelectItem>
                <SelectItem value="project">{L.project}</SelectItem>
                <SelectItem value="employee">{L.employee}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{L.kind} *</Label>
            <Select value={form.kind || "cost"} onValueChange={(v) => set("kind", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cost">{L.cost}</SelectItem>
                <SelectItem value="revenue">{L.revenue}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === "assignment" && (
            <div className="space-y-2 col-span-2">
              <Label>{L.assignmentName} *</Label>
              <Select value={form.assignment_id || ""} onValueChange={pickAssignment}>
                <SelectTrigger><SelectValue placeholder={L.selectAssignment} /></SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {`${a.employee_name || ""} · ${a.project_name || ""} (${a.start_date || ""})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scope !== "project" && (
            <div className="space-y-2">
              <Label>{L.employeeName} *</Label>
              <Select value={form.employee_id || ""} onValueChange={(v) => set("employee_id", v)}>
                <SelectTrigger><SelectValue placeholder={L.selectEmployee} /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{`${e.last_name || ""} ${e.first_name || ""}`.trim()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {scope !== "employee" && (
            <div className="space-y-2">
              <Label>{L.projectName} *</Label>
              <Select value={form.project_id || ""} onValueChange={(v) => set("project_id", v)}>
                <SelectTrigger><SelectValue placeholder={L.selectProject} /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {scope === "project" && (
            <div className="space-y-2 col-span-2">
              <Label>{L.position}</Label>
              <Input placeholder="e.g. Mason" value={form.position || ""} onChange={(e) => set("position", e.target.value)} />
            </div>
          )}

          <div className="space-y-2">
            <Label>{L.unit} *</Label>
            <Select value={form.unit || "hourly"} onValueChange={(v) => set("unit", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RATE_UNITS.map((u) => <SelectItem key={u} value={u}>{R[u]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{L.amount} *</Label>
            <Input type="number" step="0.01" value={form.amount ?? ""} onChange={(e) => set("amount", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.currency}</Label>
            <Select value={form.currency || "EUR"} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{L.status}</Label>
            <Select value={form.status || "active"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{L.active}</SelectItem>
                <SelectItem value="inactive">{L.inactive}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{L.from} *</Label>
            <Input type="date" value={form.effective_from || ""} onChange={(e) => set("effective_from", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.to}</Label>
            <Input type="date" value={form.effective_to || ""} onChange={(e) => set("effective_to", e.target.value)} placeholder={L.open} />
          </div>
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