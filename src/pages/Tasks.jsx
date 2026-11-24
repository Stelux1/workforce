import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckSquare, Search, Archive, ArrowLeft } from "lucide-react";
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

export default function Tasks() {
  const queryClient = useQueryClient();
  const t = useT();
  const { lang } = useLang();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ priority: "medium", status: "todo" });
  const [showArchive, setShowArchive] = useState(false);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => base44.entities.Task.list("-created_date", 200),
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  // Dvostruki klik je pravio dva ista zadatka (QA 14.11.2026): drugi klik dok prvi čuvanje traje se ignoriše.
  const savingRef = useRef(false);
  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Task.create(data),
    onSettled: () => { savingRef.current = false; },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      toast.success(t("Task created"));
      setDialogOpen(false);
      setForm({ priority: "medium", status: "todo" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Task.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const handleSave = () => {
    if (!form.title) {
      toast.error(t("Title is required"));
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    const emp = employees.find((e) => e.id === form.assigned_to);
    createMutation.mutate({
      ...form,
      assigned_to_name: emp ? `${emp.first_name} ${emp.last_name}` : "",
    });
  };

  const filtered = tasks.filter((task) => {
    const isCompleted = task.status === "completed";
    if (showArchive) return isCompleted;
    if (!showArchive && isCompleted) return false;
    const matchSearch = !search || task.title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || task.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={showArchive ? t("Archive") : t("Tasks")}
        subtitle={showArchive ? t("Completed tasks") : t("Assign and track tasks")}
        actionLabel={showArchive ? null : t("Add Task")}
        onAction={() => setDialogOpen(true)}
      />

      {showArchive ? (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowArchive(false)} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            {t("Back to Tasks")}
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("Search archive...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder={t("Search tasks...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue placeholder={t("Status")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All Status")}</SelectItem>
              <SelectItem value="todo">{t("To Do")}</SelectItem>
              <SelectItem value="in_progress">{t("In Progress")}</SelectItem>
              <SelectItem value="review">{t("Review")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { setShowArchive(true); setSearch(""); }} className="gap-2">
            <Archive className="w-4 h-4" />
            {t("Archive")}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{Array(4).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={CheckSquare} title={t("No tasks found")} actionLabel={t("Add Task")} onAction={() => setDialogOpen(true)} />
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <Card key={task.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{task.title}</p>
                    <StatusBadge status={task.priority} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(task.assigned_to && task.assigned_to_name) || t("Unassigned")}
                    {task.due_date && ` · ${t("Due")} ${formatDate(parseISO(task.due_date), lang === "rs" ? "d. MMM" : lang === "sk" ? "d. MMM" : "MMM d", lang)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={task.status}
                    onValueChange={(v) => updateMutation.mutate({ id: task.id, data: { status: v } })}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">{t("To Do")}</SelectItem>
                      <SelectItem value="in_progress">{t("In Progress")}</SelectItem>
                      <SelectItem value="review">{t("Review")}</SelectItem>
                      <SelectItem value="completed">{t("Completed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("Create Task")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("Title *")}</Label>
              <Input value={form.title || ""} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t("Description")}</Label>
              <Textarea value={form.description || ""} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>{t("Assign To")}</Label>
              <Select value={form.assigned_to || ""} onValueChange={(v) => setForm((p) => ({ ...p, assigned_to: v }))}>
                <SelectTrigger><SelectValue placeholder={t("Select employee")} /></SelectTrigger>
                <SelectContent>
                  {employees.filter(e => e.status === "active").map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("Due Date")}</Label>
                <Input type="date" value={form.due_date || ""} onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("Priority")}</Label>
                <Select value={form.priority || "medium"} onValueChange={(v) => setForm((p) => ({ ...p, priority: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t("Low")}</SelectItem>
                    <SelectItem value="medium">{t("Medium")}</SelectItem>
                    <SelectItem value="high">{t("High")}</SelectItem>
                    <SelectItem value="urgent">{t("Urgent")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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