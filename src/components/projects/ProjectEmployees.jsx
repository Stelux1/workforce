import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, Plus, X, Pencil, Lock } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useL } from "@/lib/translations";
import { useAuth } from "@/lib/AuthContext";
import { negativeLabourMargin } from "@/lib/projectSite";
import NegativeMarginNote from "@/components/projects/NegativeMarginNote";

// Satnica radnika na projektu je tarifa (2. nivo izbora tarife, D4) — upisuje je samo admin (baza: guard_project_rates).
// Isto pravilo kao rate_value u bazi: broj (ili tekst broja) > 0.
const hasRate = (entry) => [entry?.b2c_rate, entry?.b2b_rate].some((v) => v !== "" && v !== null && Number(v) > 0);

export default function ProjectEmployees({ project, onUpdated }) {
  const L = useL();
  const { isAdmin } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [editEntry, setEditEntry] = useState(null); // for editing existing assigned employee
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedRoleTitle, setSelectedRoleTitle] = useState("");
  const [customPosition, setCustomPosition] = useState("");
  const [customB2CRate, setCustomB2CRate] = useState("");

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list(),
  });

  const assigned = project.assigned_employees || [];
  const assignedIds = assigned.map((e) => e.employee_id);
  const available = allEmployees.filter((e) => !assignedIds.includes(e.id));
  const selectedEmployee = allEmployees.find((e) => e.id === selectedEmployeeId) || null;
  const jobRoles = project.job_roles || [];

  const resolvedRole = jobRoles.find((r) => r.title === selectedRoleTitle) || null;
  // Tarife koje će dijalog sačuvati (isto kao handleAdd/handleEditSave) — za prikaz zarade i upozorenje (spec §5).
  const dialogB2C = customB2CRate ? parseFloat(customB2CRate) : resolvedRole?.b2c_rate ?? editEntry?.b2c_rate;
  const dialogB2B = resolvedRole?.b2b_rate ?? editEntry?.b2b_rate;

  const updateMutation = useMutation({
    mutationFn: (newAssigned) =>
      base44.entities.Project.update(project.id, { assigned_employees: newAssigned }),
    onSuccess: () => {
      onUpdated();
      closeDialog();
    },
  });

  const closeDialog = () => {
    setShowAdd(false);
    setEditEntry(null);
    setSelectedEmployeeId("");
    setSelectedRoleTitle("");
    setCustomPosition("");
    setCustomB2CRate("");
  };

  const handleAdd = () => {
    if (!selectedEmployee) return;
    const position = selectedRoleTitle === "__custom" ? customPosition : selectedRoleTitle;
    if (!isAdmin) {
      // Operater raspoređuje radnika bez tarife; tarife zanimanja se ne prepisuju u unos (to je adminov izbor).
      updateMutation.mutate([...assigned, {
        employee_id: selectedEmployee.id,
        employee_name: `${selectedEmployee.last_name} ${selectedEmployee.first_name}`,
        position,
      }]);
      return;
    }
    let b2c_rate = resolvedRole?.b2c_rate;
    let b2b_rate = resolvedRole?.b2b_rate;
    
    if (customB2CRate) {
      b2c_rate = parseFloat(customB2CRate);
    }
    
    const rates = {};
    if (b2c_rate !== undefined) rates.b2c_rate = b2c_rate;
    if (b2b_rate !== undefined) rates.b2b_rate = b2b_rate;
    
    const newEntry = {
      employee_id: selectedEmployee.id,
      employee_name: `${selectedEmployee.last_name} ${selectedEmployee.first_name}`,
      position,
      ...rates,
    };
    updateMutation.mutate([...assigned, newEntry]);
  };

  const handleEditSave = () => {
    if (!editEntry) return;
    const position = selectedRoleTitle === "__custom" ? customPosition : selectedRoleTitle;
    if (!isAdmin) {
      // Operater menja samo poziciju radnika bez tarife.
      updateMutation.mutate(assigned.map((e) => (e.employee_id === editEntry.employee_id ? { ...e, position } : e)));
      return;
    }
    let b2c_rate = resolvedRole?.b2c_rate ?? editEntry.b2c_rate;
    let b2b_rate = resolvedRole?.b2b_rate ?? editEntry.b2b_rate;
    
    if (customB2CRate) {
      b2c_rate = parseFloat(customB2CRate);
    }
    
    const rates = {};
    if (b2c_rate !== undefined) rates.b2c_rate = b2c_rate;
    if (b2b_rate !== undefined) rates.b2b_rate = b2b_rate;
    
    const updated = assigned.map((e) =>
      e.employee_id === editEntry.employee_id
        ? { ...e, position, ...rates }
        : e
    );
    updateMutation.mutate(updated);
  };

  const openEdit = (emp) => {
    setEditEntry(emp);
    // pre-select role if title matches one
    const matchedRole = jobRoles.find((r) => r.title === emp.position);
    if (matchedRole) {
      setSelectedRoleTitle(emp.position);
    } else {
      setSelectedRoleTitle(emp.position ? "__custom" : "");
      setCustomPosition(emp.position || "");
    }
    setCustomB2CRate(emp.b2c_rate ? emp.b2c_rate.toString() : "");
    setShowAdd(true);
  };

  const handleRemove = (employeeId) => {
    updateMutation.mutate(assigned.filter((e) => e.employee_id !== employeeId));
  };

  return (
    <div className="bg-card border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">{L("Employees on the project", "Zaposleni na projektu", "Zamestnanci na projekte")}</h2>
          <Badge variant="secondary">{assigned.length}</Badge>
        </div>
        <Button size="sm" onClick={() => { setEditEntry(null); setShowAdd(true); }}>
          <Plus className="w-4 h-4" />
          {L("Add employee", "Dodaj zaposlenog", "Pridať zamestnanca")}
        </Button>
      </div>

      {assigned.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>{L("No employees on the project", "Nema zaposlenih na projektu", "Na projekte nie sú žiadni zamestnanci")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {assigned.map((emp) => (
            <div key={emp.employee_id} className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border">
              <div>
                <p className="font-medium text-sm">{emp.employee_name}</p>
                {emp.position && (
                  <p className="text-xs text-muted-foreground mt-0.5">{emp.position}</p>
                )}
                {isAdmin && (emp.b2c_rate || emp.b2b_rate) && (
                   <p className="text-xs text-muted-foreground mt-0.5">
                     B2B: €{emp.b2b_rate ?? "—"}/h · B2C: €{emp.b2c_rate ?? "—"}/h
                   </p>
                 )}
                {isAdmin && negativeLabourMargin(emp.b2c_rate, emp.b2b_rate) && (
                  <div className="mt-1"><NegativeMarginNote L={L} compact /></div>
                )}
              </div>
              {!isAdmin && hasRate(emp) ? (
                <span
                  className="flex items-center px-2 text-muted-foreground"
                  title={L("The rate for this employee was set by an admin — only an admin can change or remove them.", "Tarifu ovog radnika je odredio admin — menja ga i uklanja samo admin.", "Sadzbu tohto zamestnanca určil administrátor — meniť alebo odstrániť ju môže iba administrátor.")}
                >
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="sr-only">{L("Only an admin can change this employee", "Ovog radnika menja samo admin", "Tohto zamestnanca môže meniť iba administrátor")}</span>
                </span>
              ) : (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => openEdit(emp)}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(emp.employee_id)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit employee dialog */}
      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editEntry ? L("Edit employee", "Uredi zaposlenog", "Upraviť zamestnanca") : L("Add employee to project", "Dodaj zaposlenog na projekat", "Pridať zamestnanca na projekt")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Employee dropdown — only for new */}
            {!editEntry && (
              <div>
                <Label>{L("Employee", "Zaposleni", "Zamestnanec")}</Label>
                <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder={L("Select employee...", "Odaberi zaposlenog...", "Vyberte zamestnanca...")} />
                  </SelectTrigger>
                  <SelectContent>
                    {available.length === 0 ? (
                      <SelectItem value="__none" disabled>{L("All employees have already been added", "Svi zaposleni su već dodati", "Všetci zamestnanci sú už pridaní")}</SelectItem>
                    ) : (
                      available.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.last_name} {emp.first_name}
                          {emp.position ? ` — ${emp.position}` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Role / position */}
            <div>
              <Label>{L("Job role / position", "Zanimanje / pozicija", "Pracovná rola / pozícia")}</Label>
              {jobRoles.length > 0 ? (
                <>
                  <Select value={selectedRoleTitle} onValueChange={setSelectedRoleTitle}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={L("Select job role...", "Odaberi zanimanje...", "Vyberte pracovnú rolu...")} />
                    </SelectTrigger>
                    <SelectContent>
                      {jobRoles.map((r) => (
                        <SelectItem key={r.title} value={r.title}>
                          {isAdmin
                            ? `${r.title} (B2B: €${r.b2b_rate}/h${r.b2c_rate ? ` · B2C: €${r.b2c_rate}/h` : ""})`
                            : r.title}
                        </SelectItem>
                      ))}
                      <SelectItem value="__custom">{L("Other (enter manually)", "Ostalo (unesi ručno)", "Iné (zadať ručne)")}</SelectItem>
                    </SelectContent>
                  </Select>
                  {selectedRoleTitle === "__custom" && (
                    <Input
                      value={customPosition}
                      onChange={(e) => setCustomPosition(e.target.value)}
                      placeholder={L("Enter position...", "Unesite poziciju...", "Zadajte pozíciu...")}
                      className="mt-2"
                    />
                  )}
                  </>
                  ) : (
                  <Input
                  value={customPosition}
                  onChange={(e) => setCustomPosition(e.target.value)}
                  placeholder={L("Enter position...", "Unesite poziciju...", "Zadajte pozíciu...")}
                  className="mt-1"
                  />
                  )}
                  </div>

                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground">
                      {L("The employee's rate on the project is entered by an admin. Until then the project, job role and employee rates apply.", "Satnicu radnika na projektu upisuje admin. Do tada važe tarife projekta, zanimanja i radnika.", "Sadzbu zamestnanca na projekte zadáva administrátor. Dovtedy platia sadzby projektu, pracovnej roly a zamestnanca.")}
                    </p>
                  )}

                  {/* Manual B2C rate input — samo admin (tarifa, D3/D4) */}
                  {isAdmin && (resolvedRole || selectedRoleTitle) && (
                  <div>
                  <Label>{L("B2C rate - manual entry (€/h)", "B2C tarifa - ručni unos (€/h)", "Sadzba B2C – ručné zadanie (€/h)")}</Label>
                  <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={customB2CRate}
                  onChange={(e) => setCustomB2CRate(e.target.value)}
                  placeholder={resolvedRole?.b2c_rate ? L(`Default: €${resolvedRole.b2c_rate}/h`, `Podrazumevano: €${resolvedRole.b2c_rate}/h`, `Predvolené: €${resolvedRole.b2c_rate}/h`) : "0.00"}
                  className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {resolvedRole?.b2c_rate ? L("Leave empty for the default value", "Ostavite prazno za zadatu vrednost", "Nechajte prázdne pre predvolenú hodnotu") : L("Without a B2C rate, this employee's timesheets cannot be approved.", "Bez B2C tarife satnice ovog radnika ne mogu da se odobre.", "Bez sadzby B2C nemožno schváliť výkazy tohto zamestnanca.")}
                  </p>
                  </div>
                  )}

                  {/* Show profit calculation — samo admin */}
                  {isAdmin && (resolvedRole || selectedRoleTitle) && (
                    <div className="rounded-lg bg-muted/60 px-4 py-2 text-sm grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">B2B</p>
                        <p className="font-semibold">€{dialogB2B || "—"}/h</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">B2C</p>
                        <p className="font-semibold">€{customB2CRate ? parseFloat(customB2CRate).toFixed(2) : (dialogB2C || "—")}/h</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{L("Profit", "Zarada", "Zisk")}</p>
                        {(() => {
                          // Bez B2C tarife nema zarade za prikaz (ranije „€NaN/h").
                          const b2c = dialogB2C;
                          const b2b = dialogB2B;
                          return b2c > 0 && b2b > 0
                            ? <p className={`font-semibold ${b2b - b2c < 0 ? "text-red-600" : "text-green-600"}`}>€{(b2b - b2c).toFixed(2)}/h</p>
                            : <p className="font-semibold text-muted-foreground">—</p>;
                        })()}
                      </div>
                    </div>
                  )}
                  {isAdmin && (resolvedRole || selectedRoleTitle) && negativeLabourMargin(dialogB2C, dialogB2B) && (
                    <NegativeMarginNote L={L} />
                  )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>{L("Cancel", "Odustani", "Zrušiť")}</Button>
            <Button
              onClick={editEntry ? handleEditSave : handleAdd}
              disabled={(!editEntry && !selectedEmployeeId) || updateMutation.isPending}
            >
              {updateMutation.isPending ? L("Saving...", "Čuvanje...", "Ukladá sa...") : editEntry ? L("Save", "Sačuvaj", "Uložiť") : L("Add", "Dodaj", "Pridať")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}