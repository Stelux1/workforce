import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronLeft, ChevronRight, Trash2, User, Clock, MapPin, Briefcase } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format, addDays, startOfWeek, parseISO, isSameDay } from "date-fns";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import ViewToggle from "@/components/shared/ViewToggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import { useT, useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate, shortDatePattern, longDatePattern } from "@/lib/dateFormat";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";

const SHIFT_COLORS = {
  morning: "bg-amber-100 text-amber-800 border-amber-200",
  afternoon: "bg-blue-100 text-blue-800 border-blue-200",
  night: "bg-indigo-100 text-indigo-800 border-indigo-200",
  full_day: "bg-emerald-100 text-emerald-800 border-emerald-200",
  custom: "bg-purple-100 text-purple-800 border-purple-200",
};

// Status reda rasporeda (§13): assigned je uobičajen i ne dobija oznaku.
const STATUS_BADGE = {
  standby: "bg-warning-soft text-warning",
  replacement: "bg-success-soft text-success",
  released: "bg-muted text-muted-foreground",
};

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const t = useT();
  const L = useL();
  const statusLabel = (status) =>
    ({
      assigned: L("Assigned", "Raspoređen", "Zaradený"),
      standby: L("Standby", "Rezerva (standby)", "Záloha (standby)"),
      replacement: L("Replacement", "Zamena", "Zástup"),
      released: L("Released", "Oslobođen", "Uvoľnený"),
    })[status] || status;
  const { lang } = useLang();
  const [deleteShift, setDeleteShift] = useState(null);
  const shiftTypeLabel = (type) => ({
    rs: { morning: "Jutarnja", afternoon: "Popodnevna", night: "Noćna", full_day: "Ceo dan", custom: "Prilagođena" },
  sk: { morning: "Ranná", afternoon: "Poobedná", night: "Nočná", full_day: "Celý deň", custom: "Vlastná" },
    en: { morning: "Morning", afternoon: "Afternoon", night: "Night", full_day: "Full day", custom: "Custom" },
  }[lang] || {})[type] || type;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [form, setForm] = useState({});
  const [view, setView] = useViewPreference("schedule", "grid");
  const [projectFilter, setProjectFilter] = useState("all");

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const { data: allSchedules = [], isLoading, isError, error } = useQuery({
    queryKey: ["schedules"],
    queryFn: () => base44.entities.Schedule.list("-date", 500),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-created_date"),
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => base44.entities.Shift.list("sort"),
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["project-assignments"],
    queryFn: () => base44.entities.ProjectAssignment.list("-start_date"),
  });

  // Pravo menja baza (RLS); ovde samo sklanjamo dugmad onima koji ga nemaju.
  const { data: permissions } = useQuery({
    queryKey: ["my-permissions"],
    queryFn: () => base44.rpc("my_permissions"),
  });
  const canManage = Array.isArray(permissions) && permissions.includes("workforce.manage");

  const projectName = (id) => projects.find((p) => p.id === id)?.name || "";
  const schedules = projectFilter === "all" ? allSchedules : allSchedules.filter((s) => s.project_id === projectFilter);
  const formProjectShifts = shifts.filter((sh) => sh.active !== false && (!sh.project_id || sh.project_id === form.project_id));
  const formAssignments = assignments.filter(
    (a) =>
      a.status !== "cancelled" &&
      a.employee_id === form.employee_id &&
      (!form.project_id || a.project_id === form.project_id) &&
      (!form.date || (a.start_date <= form.date && (!a.end_date || a.end_date >= form.date)))
  );

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Schedule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedules"] });
      toast.success(t("Shift created"));
      setDialogOpen(false);
      setForm({});
    },
    onError: (e) => toast.error(e?.message || t("Please fill all required fields")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Schedule.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["schedules"] }),
    onError: (e) => toast.error(e?.message),
  });

  const handleSave = () => {
    const shift = shifts.find((sh) => sh.id === form.shift_id);
    const start = shift ? shift.start_time.slice(0, 5) : form.shift_start;
    const end = shift ? shift.end_time.slice(0, 5) : form.shift_end;
    if (!form.employee_id || !form.date || !start || !end) {
      toast.error(t("Please fill all required fields"));
      return;
    }
    // „Do" pre „od" ima smisla samo za noćnu smenu koja prelazi ponoć (QA §6.22); izabrana smena ima svoju definiciju.
    if (!shift && end <= start && form.shift_type !== "night") {
      toast.error(t("The shift end is before the start (only a night shift may cross midnight)."));
      return;
    }
    const emp = employees.find((e) => e.id === form.employee_id);
    createMutation.mutate({
      ...form,
      shift_start: start,
      shift_end: end,
      status: form.status || "assigned",
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "",
    });
  };

  const getShiftsForDay = (day) =>
    schedules.filter((s) => s.date && isSameDay(parseISO(s.date), day));

  const weekShifts = weekDays.flatMap((day) =>
    getShiftsForDay(day).map((s) => ({ ...s, _day: day }))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Schedule")}
        subtitle={t("Manage work shifts")}
        actionLabel={canManage ? t("Add Shift") : undefined}
        onAction={() => setDialogOpen(true)}
      >
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{L("All projects", "Svi projekti", "Všetky projekty")}</SelectItem>
            {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <ViewToggle view={view} onViewChange={setView} />
      </PageHeader>

      {isError && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 text-sm text-destructive">
            {L("The schedule could not be loaded", "Raspored nije mogao da se učita", "Rozpis sa nepodarilo načítať")}: {error?.message}
          </CardContent>
        </Card>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">{L("Loading…", "Učitavanje…", "Načítava sa…")}</p>}

      {/* Week Navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium">
          {formatDate(weekStart, shortDatePattern(lang), lang)} – {formatDate(addDays(weekStart, 6), longDatePattern(lang), lang)}
        </span>
        <Button variant="outline" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
          {t("Today")}
        </Button>
      </div>

      {view === "grid" ? (
        /* ── GRID / CALENDAR VIEW ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {weekDays.map((day) => {
            const shifts = getShiftsForDay(day);
            const isToday = isSameDay(day, new Date());
            return (
              <Card key={day.toISOString()} className={isToday ? "ring-2 ring-primary/30" : ""}>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    {formatDate(day, "EEE", lang)}
                    <span className={`block text-lg font-bold ${isToday ? "text-primary" : "text-foreground"}`}>
                      {format(day, "d")}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-1.5">
                  {shifts.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">{t("No shifts")}</p>
                  )}
                  {shifts.map((s) => (
                    <div
                      key={s.id}
                      className={`rounded-md p-2 text-xs border group relative ${SHIFT_COLORS[s.shift_type] || "bg-primary/10"}`}
                    >
                      <p className={`font-medium truncate ${s.status === "released" ? "line-through" : ""}`}>{s.employee_name}</p>
                      <p className="opacity-70">{s.shift_start} - {s.shift_end}</p>
                      {s.project_id && <p className="opacity-70 truncate">{projectName(s.project_id)}</p>}
                      {s.location && <p className="opacity-60 truncate">{s.location}</p>}
                      {STATUS_BADGE[s.status] && (
                        <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${STATUS_BADGE[s.status]}`}>{statusLabel(s.status)}</span>
                      )}
                      {canManage && (
                        <button
                          onClick={() => setDeleteShift(s)}
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ── LIST VIEW ── */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">{t("Employee")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("Date")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("Shift")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{L("Project", "Projekat", "Projekt")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">{L("Status", "Status", "Stav")}</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">{t("Location")}</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                {weekShifts.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">{t("No shifts this week")}</td></tr>
                ) : (
                  weekShifts.map((s) => {
                    const isToday = isSameDay(s._day, new Date());
                    return (
                      <tr key={s.id} className={`border-b hover:bg-muted/30 transition-colors ${isToday ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <User className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <span className="font-medium">{s.employee_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className={`font-medium ${isToday ? "text-primary" : ""}`}>{formatDate(s._day, lang === "rs" ? "EEE, d. MMM" : lang === "sk" ? "EEE, d. MMM" : "EEE, MMM d", lang)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            {s.shift_start} – {s.shift_end}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          {s.project_id ? (
                            <div className="flex items-center gap-1 text-xs"><Briefcase className="w-3 h-3" />{projectName(s.project_id)}</div>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[s.status] || "bg-muted text-foreground"}`}>
                            {statusLabel(s.status)}
                          </span>
                          {s.shift_type && (
                            <span className={`ml-1 text-xs px-2 py-0.5 rounded-full border ${SHIFT_COLORS[s.shift_type] || ""}`}>
                              {shiftTypeLabel(s.shift_type)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                          {s.location ? (
                            <div className="flex items-center gap-1 text-xs">
                              <MapPin className="w-3 h-3" />{s.location}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {canManage && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteShift(s)}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("Create Shift")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Employee *")}</Label>
              <Select value={form.employee_id || ""} onValueChange={(v) => setForm((p) => ({ ...p, employee_id: v, assignment_id: undefined }))}>
                <SelectTrigger><SelectValue placeholder={t("Select employee")} /></SelectTrigger>
                <SelectContent>
                  {employees.filter(e => e.status === "active").map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{L("Project", "Projekat", "Projekt")}</Label>
              <Select
                value={form.project_id || "none"}
                onValueChange={(v) => setForm((p) => ({ ...p, project_id: v === "none" ? undefined : v, assignment_id: undefined, shift_id: undefined }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{L("No project", "Bez projekta", "Bez projektu")}</SelectItem>
                  {projects.map((p) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {form.project_id && (
              <div className="space-y-2">
                <Label>{L("Assignment", "Angažman", "Angažovanie")}</Label>
                <Select value={form.assignment_id || ""} onValueChange={(v) => setForm((p) => ({ ...p, assignment_id: v }))}>
                  <SelectTrigger><SelectValue placeholder={formAssignments.length ? L("Select assignment", "Izaberite angažman", "Vyberte angažovanie") : L("No active assignment for this worker", "Radnik nema aktivan angažman na projektu", "Pracovník nemá aktívne angažovanie")} /></SelectTrigger>
                  <SelectContent>
                    {formAssignments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.position || a.project_name} ({a.start_date}{a.end_date ? ` – ${a.end_date}` : ""})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{L("Shift", "Smena", "Zmena")}</Label>
              <Select
                value={form.shift_id || "custom"}
                onValueChange={(v) => setForm((p) => ({ ...p, shift_id: v === "custom" ? undefined : v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">{L("Custom time", "Proizvoljno vreme", "Vlastný čas")}</SelectItem>
                  {formProjectShifts.map((sh) => (
                    <SelectItem key={sh.id} value={sh.id}>{sh.name} ({sh.start_time.slice(0, 5)} – {sh.end_time.slice(0, 5)})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{L("Status", "Status", "Stav")}</Label>
              <Select value={form.status || "assigned"} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["assigned", "standby", "replacement", "released"].map((st) => (<SelectItem key={st} value={st}>{statusLabel(st)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Date *")}</Label>
              <Input type="date" value={form.date || ""} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Start Time *")}</Label>
                <Input type="time" disabled={!!form.shift_id} value={form.shift_id ? shifts.find((sh) => sh.id === form.shift_id)?.start_time.slice(0, 5) || "" : form.shift_start || ""} onChange={(e) => setForm((p) => ({ ...p, shift_start: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("End Time *")}</Label>
                <Input type="time" disabled={!!form.shift_id} value={form.shift_id ? shifts.find((sh) => sh.id === form.shift_id)?.end_time.slice(0, 5) || "" : form.shift_end || ""} onChange={(e) => setForm((p) => ({ ...p, shift_end: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Shift Type")}</Label>
              <Select value={form.shift_type || ""} onValueChange={(v) => setForm((p) => ({ ...p, shift_type: v }))}>
                <SelectTrigger><SelectValue placeholder={t("Select type")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">{t("Morning")}</SelectItem>
                  <SelectItem value="afternoon">{t("Afternoon")}</SelectItem>
                  <SelectItem value="night">{t("Night")}</SelectItem>
                  <SelectItem value="full_day">{t("Full Day")}</SelectItem>
                  <SelectItem value="custom">{t("Custom")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Location")}</Label>
              <Input value={form.location || ""} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending}>{t("Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={!!deleteShift}
        onClose={() => setDeleteShift(null)}
        onConfirm={() => deleteMutation.mutate(deleteShift.id)}
        message={lang === "rs" ? `Obrisati smenu ${deleteShift?.employee_name || ""} (${deleteShift?.date || ""})?` : lang === "sk" ? `Odstrániť zmenu zamestnanca ${deleteShift?.employee_name || ""} (${deleteShift?.date || ""})?` : `Delete the shift of ${deleteShift?.employee_name || ""} (${deleteShift?.date || ""})?`}
      />
    </div>
  );
}