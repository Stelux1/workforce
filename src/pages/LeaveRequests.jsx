import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Calendar, Check, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { parseISO } from "date-fns";
import { formatDate } from "@/lib/dateFormat";
import { useLang } from "@/lib/LanguageContext";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { useT } from "@/lib/translations";

const LEAVE_TYPE_KEYS = {
  vacation: "Vacation", sick: "Sick Leave", personal: "Personal Leave", maternity: "Maternity",
  paternity: "Paternity", unpaid: "Unpaid", other: "Other",
};

export default function LeaveRequests() {
  const queryClient = useQueryClient();
  const t = useT();
  const { lang } = useLang();
  const leaveTypeLabel = (type) => (LEAVE_TYPE_KEYS[type] ? t(LEAVE_TYPE_KEYS[type]) : (type || "").replace(/_/g, " "));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({});

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["leave-requests"],
    queryFn: () => base44.entities.LeaveRequest.list("-created_date", 200),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.LeaveRequest.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success(t("Leave request created"));
      setDialogOpen(false);
      setForm({});
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LeaveRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leave-requests"] });
      toast.success(t("Request updated"));
    },
  });

  const handleSave = () => {
    if (!form.employee_id || !form.leave_type || !form.start_date || !form.end_date) {
      toast.error(t("Please fill all required fields"));
      return;
    }
    const emp = employees.find((e) => e.id === form.employee_id);
    createMutation.mutate({
      ...form,
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "",
      status: "pending",
    });
  };

  const filtered = requests.filter((r) => statusFilter === "all" || r.status === statusFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Leave Requests")}
        subtitle={t("Manage time-off requests")}
        actionLabel={t("New Request")}
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

      {isLoading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Calendar} title={t("No leave requests")} actionLabel={t("New Request")} onAction={() => setDialogOpen(true)} />
      ) : (
        <div className="space-y-2">
          {filtered.map((req) => (
            <Card key={req.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{req.employee_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {leaveTypeLabel(req.leave_type)} · {req.start_date && formatDate(parseISO(req.start_date), lang === "rs" ? "d. MMM" : lang === "sk" ? "d. MMM" : "MMM d", lang)} – {req.end_date && formatDate(parseISO(req.end_date), lang === "rs" ? "d. MMM yyyy." : lang === "sk" ? "d. MMM yyyy" : "MMM d, yyyy", lang)}
                  </p>
                  {req.reason && <p className="text-xs text-muted-foreground mt-1">{req.reason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={req.status} />
                  {req.status === "pending" && (
                    <>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                        onClick={() => updateMutation.mutate({ id: req.id, data: { status: "approved" } })}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => updateMutation.mutate({ id: req.id, data: { status: "rejected" } })}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
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
      </Dialog>
    </div>
  );
}