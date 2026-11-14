import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import RateDialog from "@/components/rates/RateDialog";
import AssignmentDialog from "@/components/rates/AssignmentDialog";
import RateTable from "@/components/rates/RateTable";
import AssignmentTable from "@/components/rates/AssignmentTable";
import RateResolver from "@/components/rates/RateResolver";
import { useLang } from "@/lib/LanguageContext";
import { resolveAffiliation } from "@/lib/rateEngine";

const LABELS = {
  en: {
    title: "Rates & Assignments", subtitle: "Effective-dated cost and revenue rates, and who works on which project",
    rates: "Rates", assignments: "Project Assignments", addRate: "Add Rate", addAssignment: "Add Assignment",
    searchRates: "Search rates...", searchAssignments: "Search assignments...",
    noRates: "No rates defined yet", noAssignments: "No project assignments yet",
    rateSaved: "Rate saved", rateDeleted: "Rate deleted", assignmentSaved: "Assignment saved", assignmentDeleted: "Assignment removed",
    errFrom: "Effective date is required", errAmount: "Amount is required", errNegative: "The amount can't be negative.", errDates: "The end date can't be before the start date.", errEmployee: "Choose an employee",
    errProject: "Choose a project", errAssignment: "Choose an assignment",
    errAssignmentFields: "Employee, project and start date are required",
    confirmRate: "Delete this rate? Timesheets already calculated keep their applied rate.",
    confirmAssignment: "Delete this project assignment? Historical timesheet rows stay unchanged.",
    direct: "Direct employee",
  },
  rs: {
    title: "Tarife i dodele", subtitle: "Tarife troška i prihoda sa rokovima važenja i raspored radnika po projektima",
    rates: "Tarife", assignments: "Dodele na projekte", addRate: "Nova tarifa", addAssignment: "Nova dodela",
    searchRates: "Pretraga tarifa...", searchAssignments: "Pretraga dodela...",
    noRates: "Nema definisanih tarifa", noAssignments: "Nema dodela na projekte",
    rateSaved: "Tarifa sačuvana", rateDeleted: "Tarifa obrisana", assignmentSaved: "Dodela sačuvana", assignmentDeleted: "Dodela uklonjena",
    errFrom: "Datum važenja je obavezan", errAmount: "Iznos je obavezan", errNegative: "Iznos ne može biti negativan.", errDates: "Datum završetka ne može biti pre datuma početka.", errEmployee: "Izaberite zaposlenog",
    errProject: "Izaberite projekat", errAssignment: "Izaberite dodelu",
    errAssignmentFields: "Zaposleni, projekat i datum početka su obavezni",
    confirmRate: "Obrisati tarifu? Već obračunati radni sati zadržavaju primenjenu tarifu.",
    confirmAssignment: "Obrisati dodelu? Postojeći radni sati ostaju nepromenjeni.",
    direct: "Direktan zaposleni",
  },
};

const nameOf = (e) => `${e?.last_name || ""} ${e?.first_name || ""}`.trim();

export default function RatesPage() {
  const { lang } = useLang();
  const L = LABELS[lang] || LABELS.en;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [rateForm, setRateForm] = useState({});
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({});
  const [deleteRateId, setDeleteRateId] = useState(null);
  const [deleteAssignId, setDeleteAssignId] = useState(null);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("last_name", 1000),
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => base44.entities.Project.list("name", 300),
  });
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["project-assignments"],
    queryFn: () => base44.entities.ProjectAssignment.list("-start_date", 500),
  });
  const { data: rates = [], isLoading: loadingRates } = useQuery({
    queryKey: ["rates"],
    queryFn: () => base44.entities.Rate.list("-effective_from", 500),
  });
  const { data: history = [] } = useQuery({
    queryKey: ["employment-history-all"],
    queryFn: () => base44.entities.EmploymentHistory.list("-start_date", 500),
  });
  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: () => base44.entities.Vendor.list("name", 300),
  });

  const saveRate = useMutation({
    mutationFn: (payload) => (payload.id ? base44.entities.Rate.update(payload.id, payload) : base44.entities.Rate.create(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rates"] });
      toast.success(L.rateSaved);
      setRateDialogOpen(false);
      setRateForm({});
    },
  });

  const deleteRate = useMutation({
    mutationFn: (id) => base44.entities.Rate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rates"] });
      toast.success(L.rateDeleted);
    },
  });

  const saveAssignment = useMutation({
    mutationFn: (payload) => (payload.id ? base44.entities.ProjectAssignment.update(payload.id, payload) : base44.entities.ProjectAssignment.create(payload)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-assignments"] });
      toast.success(L.assignmentSaved);
      setAssignDialogOpen(false);
      setAssignForm({});
    },
  });

  const deleteAssignment = useMutation({
    mutationFn: (id) => base44.entities.ProjectAssignment.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-assignments"] });
      toast.success(L.assignmentDeleted);
    },
  });

  const handleRateSave = () => {
    const f = rateForm;
    if (!f.effective_from) return toast.error(L.errFrom);
    if (f.amount === "" || f.amount === undefined || f.amount === null) return toast.error(L.errAmount);
    // Ista pravila kao baza (rates.amount >= 0, rates_dates) — da forma ne pušta ono što baza odbije.
    if (Number(f.amount) < 0) return toast.error(L.errNegative);
    if (f.effective_to && f.effective_to < f.effective_from) return toast.error(L.errDates);
    if (f.scope !== "project" && !f.employee_id) return toast.error(L.errEmployee);
    if (f.scope !== "employee" && !f.project_id) return toast.error(L.errProject);
    if (f.scope === "assignment" && !f.assignment_id) return toast.error(L.errAssignment);

    const employee = employees.find((e) => e.id === f.employee_id);
    const project = projects.find((p) => p.id === f.project_id);
    const assignment = assignments.find((a) => a.id === f.assignment_id);

    saveRate.mutate({
      id: f.id,
      scope: f.scope || "project",
      kind: f.kind || "cost",
      unit: f.unit || "hourly",
      amount: Number(f.amount) || 0,
      currency: f.currency || "EUR",
      employee_id: f.scope === "project" ? "" : f.employee_id || "",
      employee_name: f.scope === "project" ? "" : nameOf(employee),
      project_id: f.scope === "employee" ? "" : f.project_id || "",
      project_name: f.scope === "employee" ? "" : project?.name || "",
      position: f.scope === "project" ? f.position || "" : assignment?.position || f.position || "",
      assignment_id: f.scope === "assignment" ? f.assignment_id : "",
      effective_from: f.effective_from,
      effective_to: f.effective_to || "",
      status: f.status || "active",
      notes: f.notes || "",
    });
  };

  const handleAssignmentSave = () => {
    const f = assignForm;
    if (!f.employee_id || !f.project_id || !f.start_date) return toast.error(L.errAssignmentFields);
    if (f.end_date && f.end_date < f.start_date) return toast.error(L.errDates);

    const employee = employees.find((e) => e.id === f.employee_id);
    const project = projects.find((p) => p.id === f.project_id);
    const affiliation = resolveAffiliation({ history, employeeId: f.employee_id, date: f.start_date });

    saveAssignment.mutate({
      id: f.id,
      employee_id: f.employee_id,
      employee_name: nameOf(employee),
      project_id: f.project_id,
      project_name: project?.name || "",
      position: f.position || "",
      start_date: f.start_date,
      end_date: f.end_date || "",
      status: f.status || "active",
      affiliation_id: affiliation?.id || "",
      vendor_id: affiliation?.vendor_id || "",
      vendor_name: affiliation?.vendor_name || "",
      engagement_type: affiliation?.engagement_type || "",
      rate_reference: f.rate_reference || "",
      notes: f.notes || "",
    });
  };

  const filteredRates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rates;
    return rates.filter((r) => [r.employee_name, r.project_name, r.position, r.kind, r.scope].filter(Boolean).some((f) => f.toLowerCase().includes(q)));
  }, [rates, search]);

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter((a) => [a.employee_name, a.project_name, a.position, a.vendor_name].filter(Boolean).some((f) => f.toLowerCase().includes(q)));
  }, [assignments, search]);

  const formAffiliation = assignForm.employee_id && assignForm.start_date
    ? resolveAffiliation({ history, employeeId: assignForm.employee_id, date: assignForm.start_date })
    : null;
  const affiliationLabel = formAffiliation
    ? `${formAffiliation.engagement_type === "subcontractor_worker" ? formAffiliation.vendor_name || "—" : L.direct}${
        formAffiliation.start_date ? ` · ${formAffiliation.start_date}` : ""
      }`
    : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={L.title}
        subtitle={L.subtitle}
        actionLabel={rates.length || assignments.length ? L.addRate : undefined}
        onAction={() => { setRateForm({ scope: "project", kind: "cost", unit: "hourly", currency: "EUR", status: "active", effective_from: new Date().toISOString().slice(0, 10) }); setRateDialogOpen(true); }}
      />

      <RateResolver employees={employees} projects={projects} assignments={assignments} rates={rates} lang={lang} />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={L.searchRates} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Tabs defaultValue="rates">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="rates">{L.rates} ({rates.length})</TabsTrigger>
            <TabsTrigger value="assignments">{L.assignments} ({assignments.length})</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <button
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => { setRateForm({ scope: "project", kind: "cost", unit: "hourly", currency: "EUR", status: "active", effective_from: new Date().toISOString().slice(0, 10) }); setRateDialogOpen(true); }}
            >
              + {L.addRate}
            </button>
            <button
              className="text-sm font-medium text-primary hover:underline"
              onClick={() => { setAssignForm({ status: "active", start_date: new Date().toISOString().slice(0, 10) }); setAssignDialogOpen(true); }}
            >
              + {L.addAssignment}
            </button>
          </div>
        </div>

        <TabsContent value="rates" className="mt-3">
          {loadingRates ? (
            <Card className="h-32 animate-pulse" />
          ) : filteredRates.length === 0 ? (
            <EmptyState icon={Search} title={L.noRates} actionLabel={L.addRate} onAction={() => { setRateForm({ scope: "project", kind: "cost", unit: "hourly", currency: "EUR", status: "active", effective_from: new Date().toISOString().slice(0, 10) }); setRateDialogOpen(true); }} />
          ) : (
            <Card className="overflow-hidden">
              <RateTable rates={filteredRates} onEdit={(r) => { setRateForm(r); setRateDialogOpen(true); }} onDelete={setDeleteRateId} lang={lang} />
            </Card>
          )}
        </TabsContent>

        <TabsContent value="assignments" className="mt-3">
          {loadingAssignments ? (
            <Card className="h-32 animate-pulse" />
          ) : filteredAssignments.length === 0 ? (
            <EmptyState icon={Search} title={L.noAssignments} actionLabel={L.addAssignment} onAction={() => { setAssignForm({ status: "active", start_date: new Date().toISOString().slice(0, 10) }); setAssignDialogOpen(true); }} />
          ) : (
            <Card className="overflow-hidden">
              <AssignmentTable assignments={filteredAssignments} onEdit={(a) => { setAssignForm(a); setAssignDialogOpen(true); }} onDelete={setDeleteAssignId} lang={lang} />
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <RateDialog
        open={rateDialogOpen}
        onOpenChange={setRateDialogOpen}
        form={rateForm}
        setForm={setRateForm}
        onSave={handleRateSave}
        saving={saveRate.isPending}
        employees={employees}
        projects={projects}
        assignments={assignments}
        lang={lang}
      />

      <AssignmentDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        form={assignForm}
        setForm={setAssignForm}
        onSave={handleAssignmentSave}
        saving={saveAssignment.isPending}
        employees={employees}
        projects={projects}
        affiliationLabel={affiliationLabel}
        lang={lang}
      />

      <ConfirmDeleteDialog open={!!deleteRateId} onClose={() => setDeleteRateId(null)} onConfirm={() => deleteRate.mutate(deleteRateId)} message={L.confirmRate} />
      <ConfirmDeleteDialog open={!!deleteAssignId} onClose={() => setDeleteAssignId(null)} onConfirm={() => deleteAssignment.mutate(deleteAssignId)} message={L.confirmAssignment} />
    </div>
  );
}