import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Clock, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatDate } from "@/lib/dateFormat";

export default function Attendance() {
  const queryClient = useQueryClient();
  const t = useT();
  const { lang } = useLang();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ date: format(new Date(), "yyyy-MM-dd"), status: "present" });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["attendance"],
    queryFn: () => base44.entities.AttendanceRecord.list("-date", 200),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.AttendanceRecord.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(t("Attendance recorded"));
      setDialogOpen(false);
      setForm({ date: format(new Date(), "yyyy-MM-dd"), status: "present" });
    },
  });

  const getEmployeeName = (id) => {
    const emp = employees.find((e) => e.id === id);
    return emp ? `${emp.first_name} ${emp.last_name}` : "Unknown";
  };

  const filtered = records.filter((r) => {
    if (!search) return true;
    const name = getEmployeeName(r.employee_id);
    return name.toLowerCase().includes(search.toLowerCase());
  });

  const handleSave = () => {
    if (!form.employee_id || !form.date) {
      toast.error(t("Employee and date are required"));
      return;
    }
    let totalHours = 0;
    if (form.clock_in && form.clock_out) {
      const [inH, inM] = form.clock_in.split(":").map(Number);
      const [outH, outM] = form.clock_out.split(":").map(Number);
      // Noćna smena prelazi ponoć: odlazak „pre" dolaska znači sledeći dan (ranije 0 h, QA §6.21).
      let worked = (outH + outM / 60) - (inH + inM / 60);
      if (worked <= 0) worked += 24;
      const breakHours = (form.break_minutes || 0) / 60;
      if (breakHours >= worked) {
        toast.error(t("The break is longer than the shift."));
        return;
      }
      totalHours = worked - breakHours;
    }
    createMutation.mutate({ ...form, total_hours: Math.round(totalHours * 100) / 100 });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Attendance")}
        subtitle={t("Track employee working hours")}
        actionLabel={t("Record Attendance")}
        onAction={() => setDialogOpen(true)}
      />

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={t("Search by employee...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Clock} title={t("No attendance records")} actionLabel={t("Record Attendance")} onAction={() => setDialogOpen(true)} />
      ) : (
        <div className="space-y-2">
          {filtered.map((rec) => (
            <Card key={rec.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{getEmployeeName(rec.employee_id)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(parseISO(rec.date), lang === "rs" ? "EEE, d. MMM yyyy." : "EEE, MMM d, yyyy", lang)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium">{rec.clock_in || "—"} → {rec.clock_out || "—"}</p>
                    <p className="text-xs text-muted-foreground">{rec.total_hours ? `${rec.total_hours}h` : ""} {rec.overtime_hours ? `(+${rec.overtime_hours}h OT)` : ""}</p>
                  </div>
                  <StatusBadge status={rec.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("Record Attendance")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Employee *")}</Label>
              <Select value={form.employee_id || ""} onValueChange={(v) => setForm((p) => ({ ...p, employee_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t("Select employee")} /></SelectTrigger>
                <SelectContent>
                  {employees.filter(e => e.status === "active").map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("Date *")}</Label>
              <Input type="date" value={form.date || ""} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Clock In")}</Label>
                <Input type="time" value={form.clock_in || ""} onChange={(e) => setForm((p) => ({ ...p, clock_in: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("Clock Out")}</Label>
                <Input type="time" value={form.clock_out || ""} onChange={(e) => setForm((p) => ({ ...p, clock_out: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Break (minutes)")}</Label>
                <Input type="number" value={form.break_minutes || ""} onChange={(e) => setForm((p) => ({ ...p, break_minutes: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("Status")}</Label>
                <Select value={form.status || "present"} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">{t("Present")}</SelectItem>
                    <SelectItem value="absent">{t("Absent")}</SelectItem>
                    <SelectItem value="late">{t("Late")}</SelectItem>
                    <SelectItem value="half_day">{t("Half Day")}</SelectItem>
                    <SelectItem value="holiday">{t("Holiday")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("Overtime Hours")}</Label>
              <Input type="number" step="0.5" value={form.overtime_hours || ""} onChange={(e) => setForm((p) => ({ ...p, overtime_hours: parseFloat(e.target.value) || 0 }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending}>{t("Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}