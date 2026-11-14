import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ChevronLeft, ChevronRight, Check, X, Trash2, Send, Download, Eye, Clock, User, Pencil, Paperclip, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { format, startOfWeek, addWeeks, subWeeks, addDays, getISOWeek, getISOWeekYear } from "date-fns";
// format kept for weekLabel and dialog display
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import ViewToggle from "@/components/shared/ViewToggle";
import { useViewPreference } from "@/hooks/useViewPreference";
import SortSelect from "@/components/shared/SortSelect";
import { exportTimesheetPDF } from "@/lib/timesheetPdf";
import TimesheetPreviewModal from "@/components/timesheets/TimesheetPreviewModal";
import { useUnsavedUpload } from "@/lib/useUnsavedUpload";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { resolveAffiliation } from "@/lib/rateEngine";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate } from "@/lib/dateFormat";
import { useAuth } from "@/lib/AuthContext";
import { resolveTimesheetRates, timesheetAmounts, totalHours as sumHours, validRate } from "@/lib/payroll/timesheet";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_LABELS_RS = ["Pon", "Uto", "Sre", "Čet", "Pet", "Sub", "Ned"];

const UI = {
  en: {
    title: "Weekly Timesheets",
    subtitle: "Enter hours per day for each employee and project",
    addRow: "Add Row",
    editSelected: (n) => `Edit ${n} selected`,
    deleteSelected: (n) => `Delete ${n}`,
    thisWeek: "This Week",
    totalHours: "Total Hours",
    workerCost: "Worker Cost",
    clientRevenue: "Client Revenue",
    profit: "Profit",
    noEntries: 'No entries for this week. Click "Add Row" to start.',
    loading: "Loading...",
    weeklyTotals: "Weekly Totals",
    refId: "Ref ID",
    employee: "Employee",
    projectClient: "Project / Client",
    total: "Total",
    ot: "OT",
    status: "Status",
    exportAllPdf: "Export All PDF",
    approvalStatus: "Approval Status",
    selectStatus: "Select status to apply",
    apply: (n) => `Apply to ${n}`,
    cancel: "Cancel",
    massEdit: (n) => `Mass Edit — ${n} Row`,
    massEditDesc: "Apply a status change to all selected rows.",
    draft: "Draft",
    submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
    addTimesheetRow: "Add Timesheet Row",
    employeeLabel: "Employee *",
    selectEmployee: "Select employee",
    clientLabel: "Client",
    selectClient: "Select client",
    other: "Other",
    projectWorksite: "Project / Worksite",
    projectPlaceholder: "e.g. Kovin / SC26014",
    hoursPerDay: "Hours per Day",
    notes: "Notes",
    deleteConfirm: "Delete this row?",
    deleteSelected_confirm: (n) => `Delete ${n} selected row(s)?`,
    rowAdded: "Row added",
    saved: "Saved",
    deleted: "Deleted",
    updated: (n, s) => `Updated ${n} row(s) to "${s}"`,
    pdfExported: "PDF exported",
    pdfDownloaded: "PDF downloaded",
    selectEmployeeError: "Select an employee",
    selectStatusError: "Select a status to apply",
    cost: "Cost", revenue: "Revenue", rev: "Rev", margin: "Margin", totalShort: "Total",
    missingRate: "No rate on the project for this employee — the row is saved without a rate and can't be approved until the rate is entered on the project.",
    noRate: "no rate",
  },
  rs: {
    title: "Nedeljni radni sati",
    subtitle: "Unesite sate po danu za svakog radnika i projekat",
    addRow: "Dodaj unos",
    editSelected: (n) => `Uredi ${n} stavki`,
    deleteSelected: (n) => `Obriši ${n}`,
    thisWeek: "Ova nedelja",
    totalHours: "Ukupno sati",
    workerCost: "Trošak radnika",
    clientRevenue: "Prihod od klijenta",
    profit: "Zarada",
    noEntries: 'Nema unosa za ovu nedelju. Kliknite "Dodaj unos".',
    loading: "Učitavanje...",
    weeklyTotals: "Nedeljni ukupan",
    refId: "Ref ID",
    employee: "Radnik",
    projectClient: "Projekat / Klijent",
    total: "Ukupno",
    ot: "PT",
    status: "Status",
    exportAllPdf: "Izvezi PDF",
    approvalStatus: "Status odobrenja",
    selectStatus: "Izaberite status",
    apply: (n) => `Primeni na ${n}`,
    cancel: "Otkaži",
    massEdit: (n) => `Grupno uređivanje — ${n} red`,
    massEditDesc: "Promenite status svih označenih redova.",
    draft: "Nacrt",
    submitted: "Poslato",
    approved: "Odobreno",
    rejected: "Odbijeno",
    addTimesheetRow: "Dodaj radne sate",
    employeeLabel: "Radnik *",
    selectEmployee: "Izaberite radnika",
    clientLabel: "Klijent",
    selectClient: "Izaberite klijenta",
    other: "Drugo",
    projectWorksite: "Projekat / Gradilište",
    projectPlaceholder: "npr. Kovin / SC26014",
    hoursPerDay: "Sati po danu",
    notes: "Napomena",
    deleteConfirm: "Obrisati ovaj unos?",
    deleteSelected_confirm: (n) => `Obrisati ${n} označenih unosa?`,
    rowAdded: "Unos dodat",
    saved: "Sačuvano",
    deleted: "Obrisano",
    updated: (n, s) => `Ažurirano ${n} unosa na "${s}"`,
    pdfExported: "PDF izvezen",
    pdfDownloaded: "PDF preuzet",
    selectEmployeeError: "Izaberite radnika",
    selectStatusError: "Izaberite status",
    cost: "Trošak", revenue: "Prihod", rev: "Prihod", margin: "Marža", totalShort: "Ukupno",
    missingRate: "Radnik nema tarifu na projektu — unos se čuva bez tarife i ne može da se odobri dok se tarifa ne upiše na projektu.",
    noRate: "nema tarife",
  },
};

function getWeekStart(date) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

// Zbir i iznosi dolaze iz src/lib/payroll/timesheet.js (D11); baza ih ionako preračuna (guard_timesheet).
const calcTotals = sumHours;
const calcFinancials = (hours, b2c, b2b) => {
  const { worker_cost, client_revenue, profit } = timesheetAmounts(hours, b2c, b2b);
  return { worker_cost, client_revenue, profit };
};
const money = (v) => (v === null || v === undefined ? "—" : `€${Number(v).toFixed(0)}`);

// Generate the traceable week reference ID: e.g. 2026W20-EMP001
// ISO godina (nedelja 29.12.2025 je 2026W01) i broj projekta, da dva projekta iste nedelje nemaju istu oznaku.
function makeWeekRef(weekDate, emp, projectNumber) {
  const year = getISOWeekYear(weekDate);
  const week = String(getISOWeek(weekDate)).padStart(2, "0");
  const empId = emp?.employee_id || emp?.id?.slice(-6).toUpperCase() || "???";
  return `${year}W${week}-${empId}${projectNumber ? `-${projectNumber}` : ""}`;
}

const statusColor = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

export default function Timesheets() {
  const queryClient = useQueryClient();
  const t = useT();
  const { lang } = useLang();
  const pdfLang = lang;
  const [weekDate, setWeekDate] = useState(getWeekStart(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useViewPreference("timesheets", "list");
  const [editRow, setEditRow] = useState(null);
  const [newRowForm, setNewRowForm] = useState({});
  const [inlineEdits, setInlineEdits] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [massEditOpen, setMassEditOpen] = useState(false);
  const [massStatus, setMassStatus] = useState("");
  const [sort, setSort] = useState("name_asc");
  const [previewTs, setPreviewTs] = useState(null);
  const [deleteTsId, setDeleteTsId] = useState(null);
  const [confirmMassDelete, setConfirmMassDelete] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const attachmentUpload = useUnsavedUpload();
  const [manualProject, setManualProject] = useState(false);

  const { isAdmin } = useAuth();
  const T = UI[lang] || UI.en;
  const DAY_LABELS = lang === "rs" ? DAY_LABELS_RS : DAY_LABELS_EN;

  const weekStartStr = format(weekDate, "yyyy-MM-dd");
  const isoWeek = getISOWeek(weekDate);
  const isoYear = getISOWeekYear(weekDate);
  const weekEnd = addDays(weekDate, 6);

  // Day labels with actual dates for this week
  const dayLabelsWithDates = DAYS.map((d, i) => ({
    key: d,
    label: DAY_LABELS[i],
    date: format(addDays(weekDate, i), "d/M"),
    weekend: i >= 5,
  }));

  const weekLabel = `W${String(isoWeek).padStart(2, "0")} · ${formatDate(weekDate, lang === "rs" ? "d. MMM" : "MMM d", lang)} – ${formatDate(weekEnd, lang === "rs" ? "d. MMM yyyy." : "MMM d, yyyy", lang)}`;

  // Samo izabrana nedelja (ranije 1000 najnovijih redova za sve nedelje — starije nedelje su nestajale).
  const { data: timesheets = [], isLoading } = useQuery({
    queryKey: ["timesheets", "week", format(weekDate, "yyyy-MM-dd")],
    queryFn: () => base44.entities.Timesheet.filter({ week_start: format(weekDate, "yyyy-MM-dd") }, "-created_date"),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date", 200),
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list("-created_date", 100),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("-created_date", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Timesheet.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["timesheets"] }); toast.success(T.rowAdded); attachmentUpload.commit(); setDialogOpen(false); setNewRowForm({}); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Timesheet.update(id, data),
    onSuccess: (_row, vars) => {
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      setEditRow(null);
      // Unete izmene se brišu tek kad je čuvanje uspelo (ranije su nestajale i posle greške).
      setInlineEdits((prev) => { const n = { ...prev }; delete n[vars.id]; return n; });
      toast.success(T.saved);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Timesheet.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["timesheets"] }); toast.success(T.deleted); },
  });

  const { data: employmentHistory = [] } = useQuery({
    queryKey: ["employment-history-all"],
    queryFn: () => base44.entities.EmploymentHistory.list("-start_date", 500),
  });

  // Historical vendor attribution: store the vendor that was in force on the work date,
  // so a later vendor transfer can never rewrite earlier reporting.
  const vendorSnapshot = (employeeId, workDate) => {
    const affiliation = resolveAffiliation({ history: employmentHistory, employeeId, date: workDate });
    return {
      affiliation_id: affiliation?.id || "",
      vendor_id: affiliation?.vendor_id || "",
      vendor_name: affiliation?.engagement_type === "subcontractor_worker" ? affiliation.vendor_name || "" : "",
    };
  };

  const rsLang = lang === "rs";
  const TS_SORT_OPTIONS = [
    { value: "name_asc", label: rsLang ? "Radnik A → Ž" : "Employee A → Z" },
    { value: "name_desc", label: rsLang ? "Radnik Ž → A" : "Employee Z → A" },
    { value: "hours_desc", label: rsLang ? "Najviše sati" : "Most Hours" },
    { value: "hours_asc", label: rsLang ? "Najmanje sati" : "Least Hours" },
    { value: "status_asc", label: rsLang ? "Status A → Ž" : "Status A → Z" },
  ];

  const weekTimesheets = [...timesheets.filter((t) => t.week_start === weekStartStr)].sort((a, b) => {
    if (sort === "name_asc") return (a.employee_name || "").localeCompare(b.employee_name || "");
    if (sort === "name_desc") return (b.employee_name || "").localeCompare(a.employee_name || "");
    if (sort === "hours_desc") return (b.total_hours || 0) - (a.total_hours || 0);
    if (sort === "hours_asc") return (a.total_hours || 0) - (b.total_hours || 0);
    if (sort === "status_asc") return (a.approval_status || "").localeCompare(b.approval_status || "");
    return 0;
  });

  const getInlineValue = (ts, field) => {
    if (inlineEdits[ts.id]?.[field] !== undefined) return inlineEdits[ts.id][field];
    return ts[field] ?? "";
  };

  const setInlineValue = (tsId, field, value) => {
    setInlineEdits((prev) => ({ ...prev, [tsId]: { ...(prev[tsId] || {}), [field]: value } }));
  };

  const saveInlineRow = (ts) => {
    const edits = inlineEdits[ts.id] || {};
    const merged = { ...ts, ...edits };
    const totalHours = calcTotals(merged);
    const emp = employees.find((e) => e.id === merged.employee_id);
    const b2cRate = validRate(merged.b2c_rate) ?? validRate(emp?.b2c_hourly_rate);
    const b2bRate = validRate(merged.b2b_rate) ?? validRate(emp?.b2b_hourly_rate);
    const fin = calcFinancials(totalHours, b2cRate, b2bRate);
    updateMutation.mutate({
      id: ts.id,
      data: {
        ...edits,
        total_hours: totalHours,
        overtime_hours: Math.max(0, totalHours - 40),
        ...fin,
        b2c_rate: b2cRate,
        b2b_rate: b2bRate,
        ...vendorSnapshot(merged.employee_id, merged.week_start),
      },
    });
  };

  const handleFileUpload = async (file) => {
    if (!file) return;
    setUploadingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      attachmentUpload.track(file_url);
      setNewRowForm((p) => ({ ...p, attachment_url: file_url, attachment_name: file.name }));
    } finally {
      setUploadingFile(false); // greška se prikazuje globalno (lib/errorToasts.js)
    }
  };

  const handleAddRow = () => {
    const emp = employees.find((e) => e.id === newRowForm.employee_id);
    if (!emp) { toast.error(T.selectEmployeeError); return; }
    const totalHours = calcTotals(newRowForm);
    // Use project-specific rates stored in form, fall back to employee defaults
    const selectedProject = projects.find((p) => p.id === newRowForm._project_id);
    const assignment = selectedProject?.assigned_employees?.find((a) => a.employee_id === emp.id);
    // Tarifa koja fali ostaje prazna (null), nikad 0 — takav red ne može da se odobri (D4/D11, baza).
    const { b2c: b2cRate, b2b: b2bRate, missing } = resolveTimesheetRates(assignment, emp);
    if (missing.length) toast.warning(T.missingRate, { duration: 10000 });
    const fin = calcFinancials(totalHours, b2cRate, b2bRate);
    const weekRef = makeWeekRef(weekDate, emp, selectedProject?.project_number);
    // Strip internal _fields before saving
    const { _project_id, _b2c_rate, _b2b_rate, ...formData } = newRowForm;
    createMutation.mutate({
      ...formData,
      // Veza po ID-u (ranije samo po imenu — dva projekta istog imena su mešala satnice, QA 14.11.2026).
      project_id: manualProject ? null : _project_id || null,
      employee_name: `${emp.first_name} ${emp.last_name}`,
      week_start: weekStartStr,
      week_ref: weekRef,
      total_hours: totalHours,
      overtime_hours: Math.max(0, totalHours - 40),
      b2c_rate: b2cRate,
      b2b_rate: b2bRate,
      ...fin,
      approval_status: "draft",
      ...vendorSnapshot(emp.id, weekStartStr),
    });
  };

  // Totals
  const colTotals = DAYS.reduce((acc, d) => {
    acc[d] = weekTimesheets.reduce((s, t) => s + (parseFloat(t[`${d}_hours`]) || 0), 0);
    return acc;
  }, {});
  const grandTotal = weekTimesheets.reduce((s, t) => s + (t.total_hours || 0), 0);
  const totalCost = weekTimesheets.reduce((s, t) => s + (t.worker_cost || 0), 0);
  const totalRevenue = weekTimesheets.reduce((s, t) => s + (t.client_revenue || 0), 0);
  const totalProfit = weekTimesheets.reduce((s, t) => s + (t.profit || 0), 0);

  const exportAllPDF = async () => {
    await exportTimesheetPDF(
      weekTimesheets,
      employees,
      weekDate,
      `Timesheets_${isoYear}W${String(isoWeek).padStart(2, "0")}.pdf`,
      pdfLang,
      projects
    );
    toast.success(T.pdfExported);
  };

  const toggleSelectTs = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAllTs = () => {
    if (selected.size === weekTimesheets.length) setSelected(new Set());
    else setSelected(new Set(weekTimesheets.map((t) => t.id)));
  };

  const handleMassEditTs = async () => {
    if (!massStatus) { toast.error(T.selectStatusError); return; }
    await Promise.all([...selected].map((id) => updateMutation.mutateAsync({ id, data: { approval_status: massStatus } })));
    queryClient.invalidateQueries({ queryKey: ["timesheets"] });
    toast.success(T.updated(selected.size, massStatus));
    setSelected(new Set());
    setMassEditOpen(false);
    setMassStatus("");
  };

  const handleMassDeleteTs = async () => {
    await Promise.all([...selected].map((id) => deleteMutation.mutateAsync(id)));
    queryClient.invalidateQueries({ queryKey: ["timesheets"] });
    toast.success(`Deleted ${selected.size} row(s)`);
    setSelected(new Set());
  };

  const exportRowPDF = async (ts) => {
    const emp = employees.find((e) => e.id === ts.employee_id);
    const empName = ts.employee_name?.replace(/\s+/g, "_") || "row";
    const empIdPart = emp?.employee_id ? `_(${emp.employee_id})` : "";
    await exportTimesheetPDF(
      [ts],
      employees,
      weekDate,
      `Timesheet_${empName}${empIdPart}_${isoYear}W${String(isoWeek).padStart(2, "0")}.pdf`,
      pdfLang,
      projects
    );
    toast.success(T.pdfExported);
  };

  return (
    <div className="space-y-6">
      <PageHeader
         title={T.title}
         subtitle={T.subtitle}
         actionLabel={T.addRow}
         onAction={() => { setDialogOpen(true); setManualProject(false); setNewRowForm({}); }}
       >
        {selected.size > 0 && (
          <>
            <Button variant="outline" className="gap-2 border-primary text-primary" onClick={() => setMassEditOpen(true)}>
               <Pencil className="w-3.5 h-3.5" /> {T.editSelected(selected.size)}
             </Button>
             <Button variant="outline" className="gap-2 border-red-300 text-red-500" onClick={() => setConfirmMassDelete(true)}>
               <Trash2 className="w-3.5 h-3.5" /> {T.deleteSelected(selected.size)}
             </Button>
          </>
        )}
        <SortSelect value={sort} onValueChange={setSort} options={TS_SORT_OPTIONS} />
        <Button variant="outline" onClick={exportAllPDF} disabled={weekTimesheets.length === 0}>
          <Download className="w-4 h-4 mr-2" />{T.exportAllPdf}
        </Button>
        <ViewToggle view={view} onViewChange={setView} />
      </PageHeader>

      {/* Week Navigator */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" onClick={() => setWeekDate(subWeeks(weekDate, 1))}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="font-semibold text-sm min-w-[260px] text-center">{weekLabel}</span>
        <Button variant="outline" size="icon" onClick={() => setWeekDate(addWeeks(weekDate, 1))}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setWeekDate(getWeekStart(new Date()))}>
           {T.thisWeek}
         </Button>
        <span className="text-xs text-muted-foreground ml-1">{isoYear}W{String(isoWeek).padStart(2, "0")}</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: T.totalHours, value: grandTotal.toFixed(1) + "h" },
          { label: T.workerCost, value: "€" + totalCost.toFixed(0) },
          { label: T.clientRevenue, value: "€" + totalRevenue.toFixed(0) },
          { label: T.profit, value: "€" + totalProfit.toFixed(0), green: true },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-xl font-bold ${k.green ? "text-emerald-600" : ""}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content: Grid or List */}
      {view === "grid" ? (
        /* ── GRID VIEW: Employee summary cards ── */
        isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array(4).fill(0).map((_, i) => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : weekTimesheets.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">{T.noEntries}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {weekTimesheets.map((ts) => {
              const emp = employees.find((e) => e.id === ts.employee_id);
              const ref = ts.week_ref || makeWeekRef(weekDate, emp);
              const isApproved = ts.approval_status === "approved";
              return (
                <Card key={ts.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        {emp?.profile_photo ? (
                          <img src={emp.profile_photo} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                            {ts.employee_name?.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-sm flex items-center gap-1.5">
                              {ts.employee_name}
                              {ts.attachment_url && (
                                <a href={ts.attachment_url} target="_blank" rel="noopener noreferrer" title={ts.attachment_name || "PDF"}>
                                  <Paperclip className="w-3 h-3 text-primary hover:text-primary/70" />
                                </a>
                              )}
                            </p>
                            <p className="text-xs font-mono text-muted-foreground">{ref}</p>
                        </div>
                      </div>
                      <Badge className={`${statusColor[ts.approval_status]} border-0 capitalize text-[10px] px-1.5`}>
                        {T[ts.approval_status] || ts.approval_status}
                      </Badge>
                    </div>

                    {(ts.project || ts.client_name) && (
                      <div className="text-xs text-muted-foreground mb-3 pb-3 border-b">
                        {ts.project && <span className="font-medium text-foreground">{ts.project}</span>}
                        {ts.client_name && <span className="ml-1">· {ts.client_name}</span>}
                      </div>
                    )}

                    {/* Mini day bars */}
                    <div className="grid grid-cols-7 gap-0.5 mb-3">
                      {dayLabelsWithDates.map(({ key, label, date, weekend }) => {
                        const h = ts[`${key}_hours`] || 0;
                        return (
                          <div key={key} className="text-center">
                            <div className={`text-[9px] font-medium mb-0.5 ${weekend ? "text-amber-500" : "text-muted-foreground"}`}>{label}</div>
                            <div className={`text-xs font-bold ${h > 0 ? (weekend ? "text-amber-600" : "text-foreground") : "text-muted-foreground/30"}`}>{h || "·"}</div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="flex items-center gap-1 text-sm font-bold">
                          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                          {(ts.total_hours || 0).toFixed(1)}h
                          {(ts.overtime_hours || 0) > 0 && (
                            <span className="text-xs text-amber-600 font-normal ml-1">+{(ts.overtime_hours || 0).toFixed(1)}{T.ot}</span>
                          )}
                        </div>
                        {ts.profit > 0 && (
                          <span className="text-xs text-emerald-600 font-semibold">€{ts.profit.toFixed(0)} {T.profit.toLowerCase()}</span>
                        )}
                    </div>

                    <div className="flex items-center gap-1 mt-2 justify-end">
                      {!isApproved && (
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setEditRow(ts.id)}>✏️</Button>
                      )}
                      {ts.approval_status === "draft" && (
                        <Button size="icon" variant="outline" className="h-7 w-7 text-amber-600 border-amber-200"
                          onClick={() => updateMutation.mutate({ id: ts.id, data: { approval_status: "submitted" } })}>
                          <Send className="w-3 h-3" />
                        </Button>
                      )}
                      {isAdmin && ts.approval_status === "submitted" && (
                        <>
                          <Button size="icon" variant="outline" className="h-7 w-7 text-emerald-600 border-emerald-200"
                            onClick={() => updateMutation.mutate({ id: ts.id, data: { approval_status: "approved" } })}>
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button size="icon" variant="outline" className="h-7 w-7 text-red-500 border-red-200"
                            onClick={() => updateMutation.mutate({ id: ts.id, data: { approval_status: "rejected" } })}>
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      <Button size="icon" variant="outline" className="h-7 w-7 text-violet-500 border-violet-200"
                        onClick={() => setPreviewTs(ts)} title="Preview">
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-7 w-7 text-blue-500 border-blue-200"
                        onClick={() => exportRowPDF(ts)} title="Export PDF">
                        <Download className="w-3 h-3" />
                      </Button>

                      {!isApproved && (
                        <Button size="icon" variant="outline" className="h-7 w-7 text-red-400"
                          onClick={() => setDeleteTsId(ts.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        /* ── LIST VIEW: Excel-style table ── */
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-3 w-10">
                    <Checkbox checked={selected.size === weekTimesheets.length && weekTimesheets.length > 0} onCheckedChange={toggleSelectAllTs} />
                  </th>
                  <th className="text-left px-3 py-3 font-medium min-w-[140px] text-xs">{T.refId}</th>
                  <th className="text-left px-3 py-3 font-medium min-w-[140px]">{T.employee}</th>
                  <th className="text-left px-3 py-3 font-medium min-w-[120px]">{T.projectClient}</th>
                  {dayLabelsWithDates.map(({ key, label, date, weekend }) => (
                    <th key={key} className={`text-center px-1 py-2 font-medium w-14 ${weekend ? "text-amber-600" : ""}`}>
                      <div>{label}</div>
                      <div className="text-[10px] font-normal text-muted-foreground">{date}</div>
                    </th>
                  ))}
                  <th className="text-center px-2 py-3 font-medium w-14">{T.total}</th>
                  <th className="text-center px-2 py-3 font-medium w-12 text-amber-600 text-xs">{T.ot}</th>
                  <th className="text-center px-2 py-3 font-medium min-w-[75px] text-xs">{T.status}</th>
                  <th className="px-2 py-3 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={15} className="text-center py-8 text-muted-foreground">{T.loading}</td></tr>
                ) : weekTimesheets.length === 0 ? (
                  <tr><td colSpan={15} className="text-center py-12 text-muted-foreground">{T.noEntries}</td></tr>
                ) : (
                  weekTimesheets.map((ts) => {
                    const isEditing = editRow === ts.id;
                    const rowTotal = DAYS.reduce((s, d) => s + (parseFloat(getInlineValue(ts, `${d}_hours`)) || 0), 0);
                    const isApproved = ts.approval_status === "approved";
                    const emp = employees.find((e) => e.id === ts.employee_id);
                    const ref = ts.week_ref || makeWeekRef(weekDate, emp);
                    return (
                      <tr key={ts.id} className={`border-b hover:bg-muted/30 transition-colors ${isEditing ? "bg-blue-50/50" : ""} ${selected.has(ts.id) ? "bg-primary/5" : ""}`}>
                        <td className="px-3 py-2 w-10">
                          <Checkbox checked={selected.has(ts.id)} onCheckedChange={() => toggleSelectTs(ts.id)} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{ref}</td>
                        <td className="px-3 py-2 font-medium text-sm">
                          <div className="flex items-center gap-1.5">
                            {ts.employee_name}
                            {ts.attachment_url && (
                              <a href={ts.attachment_url} target="_blank" rel="noopener noreferrer" title={ts.attachment_name || "PDF"}>
                                <Paperclip className="w-3 h-3 text-primary hover:text-primary/70" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          <div>{ts.project || "—"}</div>
                          <div className="text-[10px]">{ts.client_name || ""}</div>
                        </td>
                        {DAYS.map((d, i) => (
                          <td key={d} className="px-1 py-2 text-center">
                            {isEditing && !isApproved ? (
                              <Input
                                type="number" min={0} max={24} step={0.5}
                                value={getInlineValue(ts, `${d}_hours`)}
                                onChange={(e) => setInlineValue(ts.id, `${d}_hours`, e.target.value)}
                                className={`w-12 h-8 text-center text-xs px-0.5 ${i >= 5 ? "border-amber-200" : ""}`}
                              />
                            ) : (
                              <span className={`${(ts[`${d}_hours`] || 0) > 0 ? "font-medium" : "text-muted-foreground/40"} ${i >= 5 && (ts[`${d}_hours`] || 0) > 0 ? "text-amber-600" : ""}`}>
                                {ts[`${d}_hours`] || 0}
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center font-bold text-sm">
                          {isEditing ? rowTotal.toFixed(1) : (ts.total_hours || 0).toFixed(1)}
                        </td>
                        <td className="px-2 py-2 text-center text-xs text-amber-600">
                          {isEditing ? Math.max(0, rowTotal - 40).toFixed(1) : (ts.overtime_hours || 0).toFixed(1)}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <Badge className={`${statusColor[ts.approval_status]} border-0 capitalize text-[10px] px-1.5`}>
                            {T[ts.approval_status] || ts.approval_status}
                          </Badge>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1 justify-end">
                            <Button size="icon" variant="outline" className="h-7 w-7 text-violet-500 border-violet-200"
                              onClick={() => setPreviewTs(ts)} title="Preview">
                              <Eye className="w-3 h-3" />
                            </Button>
                            {isEditing ? (
                              <>
                                <Button size="icon" className="h-7 w-7 bg-emerald-500 hover:bg-emerald-600" onClick={() => saveInlineRow(ts)}>
                                  <Check className="w-3 h-3" />
                                </Button>
                                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => { setEditRow(null); setInlineEdits((p) => { const n = { ...p }; delete n[ts.id]; return n; }); }}>
                                  <X className="w-3 h-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                {!isApproved && (
                                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setEditRow(ts.id)}>✏️</Button>
                                )}
                                {ts.approval_status === "draft" && (
                                  <Button size="icon" variant="outline" className="h-7 w-7 text-amber-600 border-amber-200"
                                    onClick={() => updateMutation.mutate({ id: ts.id, data: { approval_status: "submitted" } })}>
                                    <Send className="w-3 h-3" />
                                  </Button>
                                )}
                                {isAdmin && ts.approval_status === "submitted" && (
                                  <>
                                    <Button size="icon" variant="outline" className="h-7 w-7 text-emerald-600 border-emerald-200"
                                      onClick={() => updateMutation.mutate({ id: ts.id, data: { approval_status: "approved" } })}>
                                      <Check className="w-3 h-3" />
                                    </Button>
                                    <Button size="icon" variant="outline" className="h-7 w-7 text-red-500 border-red-200"
                                      onClick={() => updateMutation.mutate({ id: ts.id, data: { approval_status: "rejected" } })}>
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </>
                                )}
                                <Button size="icon" variant="outline" className="h-7 w-7 text-blue-500 border-blue-200"
                                  onClick={() => exportRowPDF(ts)} title="Export PDF">
                                  <Download className="w-3 h-3" />
                                </Button>
                                {!isApproved && (
                                  <Button size="icon" variant="outline" className="h-7 w-7 text-red-400"
                                    onClick={() => setDeleteTsId(ts.id)}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
                {weekTimesheets.length > 0 && (
                  <tr className="border-t-2 bg-muted/40 font-semibold">
                    <td className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground" colSpan={3}>{T.weeklyTotals}</td>
                    {DAYS.map((d) => (
                      <td key={d} className="px-1 py-2 text-center text-sm">{colTotals[d] || 0}</td>
                    ))}
                    <td className="px-2 py-2 text-center text-sm">{grandTotal.toFixed(1)}</td>
                    <td className="px-2 py-2 text-center text-xs text-amber-600">{weekTimesheets.reduce((s, t) => s + (t.overtime_hours || 0), 0).toFixed(1)}</td>
                    <td colSpan={2} className="px-2 py-2 text-right text-xs text-muted-foreground pr-4">
                      {T.cost}: €{totalCost.toFixed(0)} · {T.rev}: €{totalRevenue.toFixed(0)} · <span className="text-emerald-600">{T.profit}: €{totalProfit.toFixed(0)}</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Mass Edit Dialog */}
      <Dialog open={massEditOpen} onOpenChange={setMassEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{T.massEdit(selected.size)}</DialogTitle>
            <p className="text-sm text-muted-foreground">{T.massEditDesc}</p>
          </DialogHeader>
          <div className="space-y-3">
            <Label>{T.approvalStatus}</Label>
            <Select value={massStatus} onValueChange={setMassStatus}>
              <SelectTrigger><SelectValue placeholder={T.selectStatus} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{T.draft}</SelectItem>
                <SelectItem value="submitted">{T.submitted}</SelectItem>
                {/* Odobrava i odbija samo admin (baza); operater menja samo nacrt/poslato. */}
                {isAdmin && <SelectItem value="approved">{T.approved}</SelectItem>}
                {isAdmin && <SelectItem value="rejected">{T.rejected}</SelectItem>}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMassEditOpen(false)}>{T.cancel}</Button>
            <Button onClick={handleMassEditTs} disabled={updateMutation.isPending}>
              <Check className="w-4 h-4 mr-1" /> {T.apply(selected.size)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
         open={!!deleteTsId}
         onClose={() => setDeleteTsId(null)}
         onConfirm={() => deleteMutation.mutate(deleteTsId)}
         message={T.deleteConfirm}
       />
       <ConfirmDeleteDialog
         open={confirmMassDelete}
         onClose={() => setConfirmMassDelete(false)}
         onConfirm={handleMassDeleteTs}
         message={T.deleteSelected_confirm(selected.size)}
       />

      {/* Timesheet Preview Modal */}
      <TimesheetPreviewModal
        ts={previewTs}
        employees={employees}
        weekDate={weekDate}
        open={!!previewTs}
        onClose={() => setPreviewTs(null)}
        lang={pdfLang}
        projects={projects}
      />

      {/* Add Row Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) attachmentUpload.discard(); setDialogOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{T.addTimesheetRow}</DialogTitle>
            <p className="text-sm text-muted-foreground">{weekLabel} · {isoYear}W{String(isoWeek).padStart(2, "0")}</p>
          </DialogHeader>
          <div className="space-y-4">

            {/* 1. Project selection */}
            <div className="space-y-2">
              <Label>{T.projectWorksite} *</Label>
              {!manualProject ? (
                <Select
                  value={newRowForm._project_id || ""}
                  onValueChange={(v) => {
                    if (v === "__other__") {
                      setManualProject(true);
                      setNewRowForm((p) => ({ ...p, _project_id: "", project: "", employee_id: "", client_name: "" }));
                    } else {
                      const proj = projects.find((p) => p.id === v);
                      setNewRowForm((p) => ({
                        ...p,
                        _project_id: v,
                        project: proj?.name || "",
                        client_name: proj?.client_name || p.client_name,
                        employee_id: "",
                      }));
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder={lang === "rs" ? "Izaberite projekat" : "Select project"} /></SelectTrigger>
                  <SelectContent>
                    {projects.filter((p) => p.status !== "completed").map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.project_number ? `${p.project_number} · ` : ""}{p.name}
                      </SelectItem>
                    ))}
                    {projects.filter((p) => p.status === "completed").map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-muted-foreground">
                        {p.project_number ? `${p.project_number} · ` : ""}{p.name} ({lang === "rs" ? "završen" : "completed"})
                      </SelectItem>
                    ))}
                    <SelectItem value="__other__">{lang === "rs" ? "— Ručni unos —" : "— Manual entry —"}</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={newRowForm.project || ""}
                    onChange={(e) => setNewRowForm((p) => ({ ...p, project: e.target.value }))}
                    placeholder={T.projectPlaceholder}
                    autoFocus
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => { setManualProject(false); setNewRowForm((p) => ({ ...p, _project_id: "", project: "", employee_id: "" })); }}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* 2. Employee + Client (shown after project is selected) */}
            {(newRowForm._project_id || manualProject) && (() => {
              const selectedProject = projects.find((p) => p.id === newRowForm._project_id);
              const assignedEmps = selectedProject?.assigned_employees || [];
              // Filter employees to those assigned to project (or all active if manual)
              const availableEmps = manualProject
                ? employees.filter((e) => e.status === "active")
                : employees.filter((e) => e.status === "active" && assignedEmps.some((a) => a.employee_id === e.id));

              return (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{T.employeeLabel}</Label>
                    <Select
                      value={newRowForm.employee_id || ""}
                      onValueChange={(v) => {
                        const emp = employees.find((e) => e.id === v);
                        const projAssignment = assignedEmps.find((a) => a.employee_id === v);
                        // Dodela na projektu, pa profil radnika; ako nema — prazno (ne 0).
                        const { b2c, b2b } = resolveTimesheetRates(projAssignment, emp);
                        setNewRowForm((p) => ({ ...p, employee_id: v, _b2c_rate: b2c, _b2b_rate: b2b }));
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder={T.selectEmployee} /></SelectTrigger>
                      <SelectContent>
                        {availableEmps.map((e) => {
                          const assignment = assignedEmps.find((a) => a.employee_id === e.id);
                          return (
                            <SelectItem key={e.id} value={e.id}>
                              {e.last_name} {e.first_name}
                              {assignment?.position ? ` · ${assignment.position}` : ""}
                              {e.employee_id ? ` · ${e.employee_id}` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {newRowForm.employee_id && (() => {
                      const emp = employees.find((e) => e.id === newRowForm.employee_id);
                      const b2c = newRowForm._b2c_rate ?? null;
                      const b2b = newRowForm._b2b_rate ?? null;
                      return emp ? (
                        <div className="space-y-1">
                          <div className="font-mono text-xs bg-muted rounded px-2 py-1 text-primary">
                            Ref: {makeWeekRef(weekDate, emp, selectedProject?.project_number)}
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
                            <span className={b2c === null ? "text-red-600 font-medium" : ""}>B2C: {b2c === null ? T.noRate : `€${b2c}/h`}</span>
                            <span className={b2b === null ? "text-red-600 font-medium" : ""}>B2B: {b2b === null ? T.noRate : `€${b2b}/h`}</span>
                            {b2c !== null && b2b !== null && <span className="text-emerald-600">{T.margin}: €{(b2b - b2c).toFixed(2)}/h</span>}
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div className="space-y-2">
                    <Label>{T.clientLabel}</Label>
                    <Select value={newRowForm.client_name || ""} onValueChange={(v) => setNewRowForm((p) => ({ ...p, client_name: v }))}>
                      <SelectTrigger><SelectValue placeholder={T.selectClient} /></SelectTrigger>
                      <SelectContent>
                        {clients.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                        <SelectItem value="other">{T.other}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })()}

             {/* Daily hours grid */}
             <div>
               <Label className="mb-2 block">{T.hoursPerDay}</Label>
              <div className="grid grid-cols-7 gap-2">
                {dayLabelsWithDates.map(({ key, label, date, weekend }) => (
                  <div key={key} className="text-center">
                    <div className={`text-xs font-medium ${weekend ? "text-amber-600" : "text-muted-foreground"}`}>{label}</div>
                    <div className="text-[10px] text-muted-foreground mb-1">{date}</div>
                    <Input
                      type="number" min={0} max={24} step={0.5}
                      value={newRowForm[`${key}_hours`] || ""}
                      onChange={(e) => setNewRowForm((p) => ({ ...p, [`${key}_hours`]: parseFloat(e.target.value) || 0 }))}
                      className={`text-center px-1 ${weekend ? "border-amber-200" : ""}`}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
              {(() => {
                const total = calcTotals(newRowForm);
                if (total === 0) return null;
                const emp = employees.find((e) => e.id === newRowForm.employee_id);
                const b2c = newRowForm._b2c_rate ?? (manualProject ? validRate(emp?.b2c_hourly_rate) : null);
                const b2b = newRowForm._b2b_rate ?? (manualProject ? validRate(emp?.b2b_hourly_rate) : null);
                const fin = calcFinancials(total, b2c, b2b);
                return (
                  <div className="mt-3 flex flex-wrap gap-4 text-sm bg-muted/50 rounded-lg p-3">
                    <span className="font-semibold">{T.totalShort}: {total.toFixed(1)}h</span>
                    {total > 40 && <span className="text-amber-600">{T.ot}: {(total - 40).toFixed(1)}h</span>}
                    <span>{T.cost}: {money(fin.worker_cost)}</span>
                    <span>{T.revenue}: {money(fin.client_revenue)}</span>
                    {fin.profit !== null && <span className="text-emerald-600 font-semibold">{T.profit}: {money(fin.profit)}</span>}
                  </div>
                );
              })()}
            </div>

            <div className="space-y-2">
              <Label>{T.notes}</Label>
              <Textarea value={newRowForm.notes || ""} onChange={(e) => setNewRowForm((p) => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Paperclip className="w-3.5 h-3.5" />
                {lang === "rs" ? "Prilog (PDF)" : "Attachment (PDF)"}
              </Label>
              {newRowForm.attachment_url ? (
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg text-sm">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <span className="flex-1 truncate text-xs">{newRowForm.attachment_name || "attachment.pdf"}</span>
                  <button
                    type="button"
                    onClick={() => { attachmentUpload.discard(); setNewRowForm((p) => ({ ...p, attachment_url: "", attachment_name: "" })); }}
                    className="text-muted-foreground hover:text-destructive text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className={`flex items-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer hover:border-primary/50 transition-colors ${uploadingFile ? "opacity-50 pointer-events-none" : ""}`}>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  />
                  <Paperclip className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {uploadingFile
                      ? (lang === "rs" ? "Uploading..." : "Uploading...")
                      : (lang === "rs" ? "Klikni da dodaš PDF" : "Click to attach PDF")}
                  </span>
                </label>
              )}
            </div>
            </div>
            <DialogFooter>
            <Button variant="outline" onClick={() => { attachmentUpload.discard(); setDialogOpen(false); setNewRowForm({}); setManualProject(false); }}>{T.cancel}</Button>
            <Button onClick={handleAddRow} disabled={createMutation.isPending}>{T.addRow}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}