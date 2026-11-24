import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

import { Link, useSearchParams } from "react-router-dom";
import { readListParams } from "@/lib/listLinks";
import { Search, Users, Mail, Phone, Pencil, Check, ArrowUpDown, ArrowUp, ArrowDown, Upload } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import ViewToggle from "@/components/shared/ViewToggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import { toast } from "sonner";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import ImportEmployeesDialog from "@/components/employees/ImportEmployeesDialog";

export default function Employees() {
  const queryClient = useQueryClient();
  const t = useT();
  const { lang } = useLang();
  const [search, setSearch] = useState("");
  // Dashboard vodi ovde sa ?status=active (src/lib/listLinks.js).
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => readListParams(searchParams).status || "all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [view, setView] = useViewPreference("employees", "grid");
  const [selected, setSelected] = useState(new Set());
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massFields, setMassFields] = useState({});
  const [importOpen, setImportOpen] = useState(false);
  // Izbor se poništava kad se promeni pretraga ili filter — inače masovna izmena dira i radnike koji se ne vide.
  useEffect(() => { setSelected(new Set()); }, [search, statusFilter, deptFilter]);
  const [sortCol, setSortCol] = useState("name");
  const [sortDir, setSortDir] = useState("asc");

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  const { data: deptConfigs = [] } = useQuery({
    queryKey: ["department-configs"],
    queryFn: () => base44.entities.DepartmentConfig.list("name", 200),
  });

  // Odeljenja i pozicije se prikazuju po nazivu (srpski prevod se više ne unosi ni prikazuje — zahtev 6).
  const translateDept = (name) => name;

  const translatePos = (deptName, posName) => posName;

  const selectedMassDept = deptConfigs.find((d) => d.name === massFields.department);
  const massPositions = selectedMassDept?.positions || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Employee.update(id, data),
  });

  const toggleSelect = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e.id)));
  };

  const handleMassEdit = async () => {
    const updates = Object.fromEntries(Object.entries(massFields).filter(([, v]) => v !== ""));
    if (Object.keys(updates).length === 0) { toast.error(t("No fields to update")); return; }
    await Promise.all([...selected].map((id) => updateMutation.mutateAsync({ id, data: updates })));
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    toast.success(`Updated ${selected.size} employee(s)`);
    setSelected(new Set());
    setMassEditOpen(false);
    setMassFields({});
  };

  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean))];

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />;
    return sortDir === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />;
  };

  const applySort = (arr) => {
    return [...arr].sort((a, b) => {
      let valA = "", valB = "";
      if (sortCol === "name") { valA = `${a.last_name} ${a.first_name}`; valB = `${b.last_name} ${b.first_name}`; }
      else if (sortCol === "department") { valA = a.department || ""; valB = b.department || ""; }
      else if (sortCol === "position") { valA = a.position || ""; valB = b.position || ""; }
      else if (sortCol === "id") { valA = a.employee_id || ""; valB = b.employee_id || ""; }
      else if (sortCol === "status") { valA = a.status || ""; valB = b.status || ""; }
      const cmp = valA.localeCompare(valB);
      return sortDir === "asc" ? cmp : -cmp;
    });
  };

  const filtered = applySort(employees.filter((e) => {
    const matchSearch =
      !search ||
      `${e.first_name} ${e.last_name} ${e.position} ${e.employee_id}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    const matchDept = deptFilter === "all" || e.department === deptFilter;
    return matchSearch && matchStatus && matchDept;
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Employees")}
        subtitle={`${employees.length} ${t("total employees")}`}
        actionLabel={t("Add Employee")}
        onAction={() => (window.location.href = "/employees/new")}
      >
        {selected.size > 0 && (
          <Button variant="outline" className="gap-2 border-primary text-primary" onClick={() => setMassEditOpen(true)}>
            <Pencil className="w-3.5 h-3.5" /> {t("Edit %d selected").replace("%d", selected.size)}
          </Button>
        )}
        <ViewToggle view={view} onViewChange={setView} />
        <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
          <Upload className="w-4 h-4" /> {t("Import CSV")}
        </Button>
      </PageHeader>
      <ImportEmployeesDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("Search employees...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={t("Status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Status")}</SelectItem>
            <SelectItem value="active">{t("Active")}</SelectItem>
            <SelectItem value="suspended">{t("Suspended")}</SelectItem>
            <SelectItem value="on_leave">{t("On Leave")}</SelectItem>
            <SelectItem value="terminated">{t("Terminated")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={t("Department")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Departments")}</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>

      </div>

      {/* Content */}
      {isLoading ? (
        view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("No employees found")}
          description={search ? t("Try adjusting your search") : t("Add your first employee to get started")}
          actionLabel={!search ? t("Add Employee") : undefined}
          onAction={() => (window.location.href = "/employees/new")}
        />
      ) : view === "grid" ? (
        /* ── GRID VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((emp) => (
            <Card key={emp.id} className={`p-5 hover:shadow-lg transition-all duration-200 hover:border-primary/30 h-full group relative ${selected.has(emp.id) ? "ring-2 ring-primary border-primary" : ""}`}>
              <div className="absolute top-3 left-3">
                <Checkbox checked={selected.has(emp.id)} onCheckedChange={() => toggleSelect(emp.id)} />
              </div>
              <Link to={`/employees/${emp.id}`} className="block">
                <div className="flex items-start gap-4 pl-6">
                  {emp.profile_photo ? (
                    <img src={emp.profile_photo} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-border" />
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary shrink-0">
                      {emp.first_name?.[0]}{emp.last_name?.[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="font-semibold truncate group-hover:text-primary transition-colors">{emp.last_name} {emp.first_name}</p>
                      <StatusBadge status={emp.status} />
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{translatePos(emp.department, emp.position) || t("No position")}</p>
                    <p className="text-xs text-muted-foreground">{translateDept(emp.department) || t("No department")}</p>
                    {emp.employee_id && (
                      <p className="text-xs font-mono text-primary/70 mt-1">ID: {emp.employee_id}</p>
                    )}
                  </div>
                </div>
                {(emp.email || emp.phone) && (
                  <div className="mt-3 pt-3 border-t space-y-1 pl-6">
                    {emp.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" /><span className="truncate">{emp.email}</span>
                      </div>
                    )}
                    {emp.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" /><span>{emp.phone}</span>
                      </div>
                    )}
                  </div>
                )}
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 w-10">
                    <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleSelectAll} />
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-primary transition-colors">{t("Employee")}<SortIcon col="name" /></button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">
                    <button onClick={() => toggleSort("department")} className="flex items-center gap-1 hover:text-primary transition-colors">{t("Department")}<SortIcon col="department" /></button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
                    <button onClick={() => toggleSort("position")} className="flex items-center gap-1 hover:text-primary transition-colors">{t("Position")}<SortIcon col="position" /></button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{t("Contact")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
                    <button onClick={() => toggleSort("id")} className="flex items-center gap-1 hover:text-primary transition-colors">ID<SortIcon col="id" /></button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium">
                    <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-primary transition-colors">{t("Status")}<SortIcon col="status" /></button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id} className={`border-b hover:bg-muted/30 transition-colors ${selected.has(emp.id) ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-3 w-10">
                      <Checkbox checked={selected.has(emp.id)} onCheckedChange={() => toggleSelect(emp.id)} />
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/employees/${emp.id}`} className="flex items-center gap-3 group">
                        {emp.profile_photo ? (
                          <img src={emp.profile_photo} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                            {emp.first_name?.[0]}{emp.last_name?.[0]}
                          </div>
                        )}
                        <span className="font-medium group-hover:text-primary transition-colors">{emp.last_name} {emp.first_name}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{translateDept(emp.department) || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{translatePos(emp.department, emp.position) || "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="text-xs space-y-0.5">
                        {emp.email && <div className="flex items-center gap-1 text-muted-foreground"><Mail className="w-3 h-3" />{emp.email}</div>}
                        {emp.phone && <div className="flex items-center gap-1 text-muted-foreground"><Phone className="w-3 h-3" />{emp.phone}</div>}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">{emp.employee_id || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={emp.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {/* Mass Edit Dialog */}
      <Dialog open={massEditOpen} onOpenChange={setMassEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selected.size === 1
                ? t("Mass Edit — %d Employee").replace("%d", selected.size)
                : t("Mass Edit — %d Employees").replace("%d", selected.size)}
            </DialogTitle>
            <p className="text-sm text-muted-foreground">{t("Only filled fields will be updated.")}</p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Status")}</Label>
              <Select value={massFields.status || ""} onValueChange={(v) => setMassFields((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue placeholder={t("Leave unchanged")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("Active")}</SelectItem>
                  <SelectItem value="suspended">{t("Suspended")}</SelectItem>
                  <SelectItem value="on_leave">{t("On Leave")}</SelectItem>
                  <SelectItem value="terminated">{t("Terminated")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Department")}</Label>
              {deptConfigs.length > 0 ? (
                <Select value={massFields.department || ""} onValueChange={(v) => setMassFields((p) => ({ ...p, department: v, position: "" }))}>
                  <SelectTrigger><SelectValue placeholder={t("Leave unchanged")} /></SelectTrigger>
                  <SelectContent>
                    {deptConfigs.map((d) => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder={t("Leave blank to keep current")} value={massFields.department || ""} onChange={(e) => setMassFields((p) => ({ ...p, department: e.target.value }))} />
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("Position")}</Label>
              {massPositions.length > 0 ? (
                <Select value={massFields.position || ""} onValueChange={(v) => setMassFields((p) => ({ ...p, position: v }))}>
                  <SelectTrigger><SelectValue placeholder={t("Leave unchanged")} /></SelectTrigger>
                  <SelectContent>
                    {/* Pozicija je objekat {name} (ili stari string) — crtanje objekta je rušilo stranicu. */}
                    {massPositions.map((pos) => {
                      const value = typeof pos === "string" ? pos : pos.name;
                      const label = typeof pos === "string" ? pos : pos.name;
                      return <SelectItem key={value} value={value}>{label}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder={massFields.department ? t("No positions in this dept") : t("Select a department first")} value={massFields.position || ""} onChange={(e) => setMassFields((p) => ({ ...p, position: e.target.value }))} />
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("Work Location")}</Label>
              <Input placeholder={t("Leave blank to keep current")} value={massFields.work_location || ""} onChange={(e) => setMassFields((p) => ({ ...p, work_location: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMassEditOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={handleMassEdit} disabled={updateMutation.isPending}>
              <Check className="w-4 h-4 mr-1" /> {t("Apply to %d").replace("%d", selected.size)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}