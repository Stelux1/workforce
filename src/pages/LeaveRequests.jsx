// Leave Requests (spec §14): zahtevi za odsustvo, odluka uz proveru kapaciteta (simulacija pre odluke, razlog obavezan
// uz manjak, ko/kada/zašto) i predlozi zamena. Status se menja samo kroz RPC `decide_leave_request` (baza odbija
// direktnu izmenu statusa); zamena nastaje samo kroz `assign_replacement`, tek posle potvrde ovlašćenog korisnika.
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { readListParams } from "@/lib/listLinks";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Calendar, ClipboardCheck, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { formatIsoDate, intlLocale } from "@/lib/dateFormat";
import { useLang } from "@/lib/LanguageContext";
import { pageTitle } from "@/lib/pageTitles";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useL, useT } from "@/lib/translations";
import { useAuth } from "@/lib/AuthContext";
import { useStaffDirectory } from "@/hooks/useStaffDirectory";
import { useMyPermissions } from "@/lib/documentCategories";
import { isoDate } from "@/lib/onboarding";
import { shortageTotals, snapshotRows } from "@/lib/replacements";
import CapacityImpact from "@/components/leave/CapacityImpact";
import DecisionDialog from "@/components/leave/DecisionDialog";
import ReplacementSuggestions from "@/components/leave/ReplacementSuggestions";
import { ErrorNote, errorText, makeLookups } from "@/components/leave/common";

const LEAVE_TYPE_KEYS = {
  vacation: "Vacation", sick: "Sick Leave", personal: "Personal Leave", maternity: "Maternity",
  paternity: "Paternity", unpaid: "Unpaid", other: "Other",
};

function DecisionInfo({ req, lookups, staff }) {
  const L = useL();
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const rows = snapshotRows(req.shortage_snapshot);
  const requester = staff?.name(req.requested_by || req.created_by);
  if (req.status === "pending") {
    return requester ? <p className="mt-2 text-xs text-muted-foreground">{L("Requested by", "Zahtev uneo", "Žiadosť zadal")}: {requester}</p> : null;
  }
  // §14: ko je odlučio — ime iz staff_directory(), inače snimak imena iz reviewed_by (puni ga baza).
  const who = staff?.name(req.decided_by) || req.reviewed_by || null;
  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground" data-testid="decision-info">
      {requester && <p>{L("Requested by", "Zahtev uneo", "Žiadosť zadal")}: {requester}</p>}
      <p>
        {req.status === "approved" ? L("Approved", "Odobrio", "Schválil") : L("Rejected", "Odbio", "Zamietol")}
        {who ? `: ${who}` : ""}
        {req.decided_at ? ` · ${new Date(req.decided_at).toLocaleString(intlLocale(lang), { dateStyle: "medium", timeStyle: "short" })}` : ""}
        {!req.decided_at && L(" (before capacity control)", " (pre kontrole kapaciteta)", " (pred kontrolou kapacity)")}
      </p>
      {req.decision_reason && <p>{L("Reason", "Razlog", "Dôvod")}: „{req.decision_reason}”</p>}
      {req.shortage_override && (
        <button type="button" className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-warning" onClick={() => setOpen((v) => !v)}>
          <AlertTriangle className="w-3 h-3" />
          {L(`Approved despite a shortage (+${shortageTotals(rows).added})`, `Odobreno uprkos manjku (+${shortageTotals(rows).added})`, `Schválené napriek nedostatku (+${shortageTotals(rows).added})`)}
        </button>
      )}
      {open && <div className="pt-1"><CapacityImpact rows={rows} lookups={lookups} snapshot /></div>}
    </div>
  );
}

export default function LeaveRequests() {
  const queryClient = useQueryClient();
  const t = useT();
  const L = useL();
  const { lang } = useLang();
  const leaveTypeLabel = (type) => (LEAVE_TYPE_KEYS[type] ? t(LEAVE_TYPE_KEYS[type]) : (type || "").replace(/_/g, " "));
  const [dialogOpen, setDialogOpen] = useState(false);
  // Dashboard i obaveštenja vode ovde sa ?status=pending (src/lib/listLinks.js).
  const [searchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState(() => readListParams(searchParams).status || "all");
  const [form, setForm] = useState({});
  const [deciding, setDeciding] = useState(null);
  const [replacing, setReplacing] = useState(null);

  const { can, loading: permsLoading } = useMyPermissions(useAuth());
  const staff = useStaffDirectory();
  const canDecide = can("leave.approve");
  const canManage = can("leave.manage");
  const canApproveShortage = can("leave.approve_shortage");
  const canAssign = can("workforce.manage");
  const canViewB2C = can("rates.view_b2c");

  const requestsQ = useQuery({
    queryKey: ["leave-requests"],
    queryFn: () => base44.entities.LeaveRequest.list("-created_date", 200),
  });
  const requests = requestsQ.data || [];
  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });
  // Nazivi za prikaz kapaciteta (projekat, Job Role, smena).
  const { data: names } = useQuery({
    queryKey: ["leave-requests", "names"],
    queryFn: async () => {
      const [projects, roles, shifts] = await Promise.all([
        base44.entities.Project.list("name"), base44.entities.ProjectRole.list("sort"), base44.entities.Shift.list("sort"),
      ]);
      return { projects, roles, shifts };
    },
  });
  const lookups = useMemo(() => makeLookups({ ...(names || {}), employees }), [names, employees]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.LeaveRequest.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success(t("Leave request created"));
      setDialogOpen(false);
      setForm({});
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const handleSave = () => {
    if (!form.employee_id || !form.leave_type || !form.start_date || !form.end_date) {
      toast.error(t("Please fill all required fields"));
      return;
    }
    if (form.end_date < form.start_date) {
      toast.error(L("The end date can't be before the start date.", "Datum završetka ne može biti pre datuma početka.", "Dátum ukončenia nemôže byť pred dátumom začiatku."));
      return;
    }
    const emp = employees.find((e) => e.id === form.employee_id);
    createMutation.mutate({
      ...form,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "",
      status: "pending",
    });
  };

  const today = isoDate();
  const filtered = requests.filter((r) => statusFilter === "all" || r.status === statusFilter);
  const deepLinked = searchParams.get("leave");
  const replacingLeave = replacing ? requests.find((r) => r.id === replacing) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={pageTitle("Leave Requests", lang)}
        subtitle={t("Manage time-off requests")}
        actionLabel={canManage ? t("New Request") : undefined}
        onAction={() => setDialogOpen(true)}
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder={t("Status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("All Status")}</SelectItem>
            <SelectItem value="pending">{t("Pending")}</SelectItem>
            <SelectItem value="approved">{t("Approved")}</SelectItem>
            <SelectItem value="rejected">{t("Rejected")}</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {requestsQ.isLoading ? (
        <div className="space-y-3" aria-busy="true">{Array(4).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : requestsQ.error ? (
        <ErrorNote error={requestsQ.error} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Calendar} title={t("No leave requests")} actionLabel={canManage ? t("New Request") : undefined} onAction={() => setDialogOpen(true)} />
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => {
            const open = req.status !== "rejected" && req.end_date >= today;
            return (
              <Card key={req.id} className={`hover:shadow-card transition-shadow ${deepLinked === req.id ? "ring-2 ring-primary" : ""}`} data-testid={`leave-${req.id}`}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{req.employee_name || lookups.employee(req.employee_id)}</p>
                    <p className="text-xs text-muted-foreground">
                      {leaveTypeLabel(req.leave_type)} · {formatIsoDate(req.start_date, lang)} – {formatIsoDate(req.end_date, lang)}
                    </p>
                    {req.reason && <p className="text-xs text-muted-foreground mt-1">{req.reason}</p>}
                    <DecisionInfo req={req} lookups={lookups} staff={staff} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <StatusBadge status={req.status} />
                    {req.status === "pending" && canDecide && (
                      <Button size="sm" variant="outline" onClick={() => setDeciding(req)} data-testid="review-leave">
                        <ClipboardCheck className="w-4 h-4 mr-1" />{L("Review", "Odluka", "Rozhodnúť")}
                      </Button>
                    )}
                    {req.status === "pending" && !canDecide && !permsLoading && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ShieldCheck className="w-3 h-3" />{L("Awaiting an authorised manager", "Čeka ovlašćenog menadžera", "Čaká na oprávneného manažéra")}
                      </span>
                    )}
                    {open && (canAssign || canDecide) && (
                      <Button size="sm" variant="outline" onClick={() => setReplacing(req.id)} data-testid="open-replacements">
                        <Users className="w-4 h-4 mr-1" />{L("Replacements", "Zamene", "Zástupy")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DecisionDialog
        leave={deciding}
        open={!!deciding}
        onOpenChange={(v) => !v && setDeciding(null)}
        lookups={lookups}
        canApproveShortage={canApproveShortage}
        leaveTypeLabel={leaveTypeLabel}
        onApprovedWithShortage={(id) => canAssign && setTimeout(() => setReplacing(id), 150)}
      />

      <Dialog open={!!replacingLeave} onOpenChange={(v) => !v && setReplacing(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{L("Replacement suggestions", "Predlozi zamena", "Návrhy zástupov")}</DialogTitle>
            {replacingLeave && (
              <DialogDescription>
                {replacingLeave.employee_name || lookups.employee(replacingLeave.employee_id)} · {leaveTypeLabel(replacingLeave.leave_type)} ·{" "}
                {formatIsoDate(replacingLeave.start_date, lang)} – {formatIsoDate(replacingLeave.end_date, lang)}
                {replacingLeave.status === "pending" && L(" (pending — shown as if approved)", " (na čekanju — prikaz kao da je odobreno)", " (čaká — zobrazené, akoby bolo schválené)")}
              </DialogDescription>
            )}
          </DialogHeader>
          {replacingLeave && <ReplacementSuggestions leave={replacingLeave} canAssign={canAssign} canViewB2C={canViewB2C} />}
        </DialogContent>
      </Dialog>

      {canManage && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("New Leave Request")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Employee *")}</Label>
              <Select value={form.employee_id || ""} onValueChange={(v) => setForm((p) => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t("Select employee")} /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Leave Type *")}</Label>
              <Select value={form.leave_type || ""} onValueChange={(v) => setForm((p) => ({ ...p, leave_type: v }))}>
                <SelectTrigger><SelectValue placeholder={t("Select type")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">{t("Vacation")}</SelectItem>
                  <SelectItem value="sick">{t("Sick Leave")}</SelectItem>
                  <SelectItem value="personal">{t("Personal Leave")}</SelectItem>
                  <SelectItem value="maternity">{t("Maternity")}</SelectItem>
                  <SelectItem value="paternity">{t("Paternity")}</SelectItem>
                  <SelectItem value="unpaid">{t("Unpaid")}</SelectItem>
                  <SelectItem value="other">{t("Other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Start Date *")}</Label>
                <Input type="date" value={form.start_date || ""} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("End Date *")}</Label>
                <Input type="date" value={form.end_date || ""} onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Reason")}</Label>
              <Textarea value={form.reason || ""} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending}>{t("Submit")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  );
}
