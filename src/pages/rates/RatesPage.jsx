// Tarife i dodele (/rates): Rate History i dodele nad jednom evidencijom (rates, project_assignments) — iste zapise
// menja i kartica projekta (Overview: Job Role tarife, Workers: dodele). Redizajn u „Project Assignments" je W2-K.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import RateDialog, { invalidateRateViews } from "@/components/rates/RateDialog";
import AssignmentDialog, { EndAssignmentDialog } from "@/components/rates/AssignmentDialog";
import RateTable from "@/components/rates/RateTable";
import AssignmentTable from "@/components/rates/AssignmentTable";
import RateResolver from "@/components/rates/RateResolver";
import { useLang } from "@/lib/LanguageContext";
import { useL } from "@/lib/translations";
import { useAuth } from "@/lib/AuthContext";

export default function RatesPage() {
  const { lang } = useLang();
  const L = useL();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canRates = Boolean(can?.("rates.manage"));
  const canAssign = Boolean(can?.("assignments.manage"));
  const canSeeRates = canRates || Boolean(can?.("rates.view_b2b")) || Boolean(can?.("rates.view_b2c"));

  const [tab, setTab] = useState(canSeeRates ? "rates" : "assignments");
  const [search, setSearch] = useState("");
  const [rateDialog, setRateDialog] = useState(null); // { mode, rate? }
  const [assignDialog, setAssignDialog] = useState(null); // { assignment | null }
  const [endDialog, setEndDialog] = useState(null); // { assignment, mode }
  const [deleteRateId, setDeleteRateId] = useState(null);

  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: () => base44.entities.Employee.list("last_name") });
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => base44.entities.Project.list("name", 300) });
  const assignmentsQ = useQuery({ queryKey: ["project-assignments"], queryFn: () => base44.entities.ProjectAssignment.list("-start_date") });
  const ratesQ = useQuery({ queryKey: ["rates"], queryFn: () => base44.entities.Rate.list("-effective_from"), enabled: canSeeRates });
  const { data: history = [] } = useQuery({
    queryKey: ["employment-history-all"],
    queryFn: () => base44.entities.EmploymentHistory.list("-start_date", 500),
  });
  const assignments = assignmentsQ.data || [];
  const rates = ratesQ.data || [];

  const deleteRate = useMutation({
    mutationFn: (id) => base44.entities.Rate.delete(id),
    onSuccess: () => {
      invalidateRateViews(queryClient);
      toast.success(L("Rate deleted", "Tarifa obrisana", "Sadzba odstránená"));
    },
    onError: (e) => toast.error(e.message),
  });

  const q = search.trim().toLowerCase();
  const matches = (fields) => !q || fields.filter(Boolean).some((f) => String(f).toLowerCase().includes(q));
  const filteredRates = useMemo(() => rates.filter((r) => matches([r.employee_name, r.project_name, r.position, r.change_reason])), [rates, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredAssignments = useMemo(() => assignments.filter((a) => matches([a.employee_name, a.project_name, a.position, a.vendor_name])), [assignments, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const newRate = () => setRateDialog({ mode: "create" });
  const newAssignment = () => setAssignDialog({ assignment: null });

  return (
    <div className="space-y-6">
      <PageHeader
        title={L("Rates & Assignments", "Tarife i dodele", "Sadzby a pridelenia")}
        subtitle={L("Rate history with effective dates and who works on which project — the same records as on each project",
          "Istorija tarifa sa datumima važenja i raspored radnika po projektima — isti zapisi kao na kartici projekta",
          "História sadzieb s dátumami platnosti a kto pracuje na ktorom projekte — rovnaké záznamy ako na projekte")}
        actionLabel={tab === "rates" ? (canRates ? L("New rate", "Nova tarifa", "Nová sadzba") : undefined) : canAssign ? L("Add assignment", "Nova dodela", "Pridať pridelenie") : undefined}
        onAction={tab === "rates" ? newRate : newAssignment}
      />

      {canSeeRates && <RateResolver employees={employees} projects={projects} assignments={assignments} rates={rates} lang={lang} />}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={L("Search...", "Pretraga...", "Hľadať...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {canSeeRates && <TabsTrigger value="rates">{L("Rate history", "Istorija tarifa", "História sadzieb")} ({rates.length})</TabsTrigger>}
          <TabsTrigger value="assignments">{L("Assignments", "Dodele", "Pridelenia")} ({assignments.length})</TabsTrigger>
        </TabsList>

        {canSeeRates && (
          <TabsContent value="rates" className="mt-3">
            {ratesQ.isLoading ? (
              <Card className="h-32 animate-pulse" />
            ) : ratesQ.isError ? (
              <Card className="p-4 text-sm text-destructive">{ratesQ.error?.message}</Card>
            ) : filteredRates.length === 0 ? (
              <EmptyState icon={Search} title={L("No rates yet", "Nema tarifa", "Zatiaľ žiadne sadzby")}
                actionLabel={canRates ? L("New rate", "Nova tarifa", "Nová sadzba") : undefined} onAction={canRates ? newRate : undefined} />
            ) : (
              <Card className="overflow-hidden">
                <RateTable rates={filteredRates} canManage={canRates} lang={lang}
                  onChange={(rate) => setRateDialog({ mode: "change", rate })}
                  onEdit={(rate) => setRateDialog({ mode: "edit", rate })}
                  onDelete={setDeleteRateId} />
              </Card>
            )}
          </TabsContent>
        )}

        <TabsContent value="assignments" className="mt-3">
          {assignmentsQ.isLoading ? (
            <Card className="h-32 animate-pulse" />
          ) : assignmentsQ.isError ? (
            <Card className="p-4 text-sm text-destructive">{assignmentsQ.error?.message}</Card>
          ) : filteredAssignments.length === 0 ? (
            <EmptyState icon={Search} title={L("No project assignments yet", "Nema dodela na projekte", "Zatiaľ žiadne pridelenia")}
              actionLabel={canAssign ? L("Add assignment", "Nova dodela", "Pridať pridelenie") : undefined} onAction={canAssign ? newAssignment : undefined} />
          ) : (
            <Card className="overflow-hidden">
              <AssignmentTable assignments={filteredAssignments} canManage={canAssign} lang={lang}
                onEdit={(assignment) => setAssignDialog({ assignment })}
                onEnd={(assignment) => setEndDialog({ assignment, mode: "end" })}
                onCancel={(assignment) => setEndDialog({ assignment, mode: "cancel" })} />
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <RateDialog open={Boolean(rateDialog)} onOpenChange={(o) => !o && setRateDialog(null)} mode={rateDialog?.mode} rate={rateDialog?.rate}
        projects={projects} assignments={assignments} />
      <AssignmentDialog open={Boolean(assignDialog)} onOpenChange={(o) => !o && setAssignDialog(null)} assignment={assignDialog?.assignment}
        projects={projects} employees={employees} history={history} />
      <EndAssignmentDialog open={Boolean(endDialog)} onOpenChange={(o) => !o && setEndDialog(null)} assignment={endDialog?.assignment} mode={endDialog?.mode} />
      <ConfirmDeleteDialog open={!!deleteRateId} onClose={() => setDeleteRateId(null)} onConfirm={() => deleteRate.mutate(deleteRateId)}
        message={L("Delete this rate? A rate already used in a timesheet can't be deleted — set it to Inactive instead.",
          "Obrisati tarifu? Tarifa koja je već korišćena u satnici se ne briše — postavite je na Neaktivna.",
          "Odstrániť sadzbu? Sadzbu použitú vo výkaze nemožno odstrániť — nastavte ju ako Neaktívnu.")} />
    </div>
  );
}
