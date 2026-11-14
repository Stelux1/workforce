import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, X, Settings2, Pencil, Check, Grid3x3, List } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";

export default function DepartmentsSettings() {
  const T = useT();
  const { lang } = useLang();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [form, setForm] = useState({ name: "", translation: "", positions: [] });
  const [newPosition, setNewPosition] = useState("");
  const [newPositionTranslation, setNewPositionTranslation] = useState("");
  const [newDepartmentTranslation, setNewDepartmentTranslation] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [editingPositionKey, setEditingPositionKey] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["department-configs"],
    queryFn: () => base44.entities.DepartmentConfig.list("name", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.DepartmentConfig.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["department-configs"] }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.DepartmentConfig.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["department-configs"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.DepartmentConfig.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["department-configs"] }); },
  });

  const openNew = () => {
    setEditingDept(null);
    setForm({ name: "", translation: "", positions: [] });
    setNewPosition("");
    setNewPositionTranslation("");
    setNewDepartmentTranslation("");
    setDialogOpen(true);
  };

  const openEdit = (dept) => {
    setEditingDept(dept);
    setForm({ name: dept.name, translation: dept.translation || "", positions: dept.positions || [] });
    setNewPosition("");
    setNewPositionTranslation("");
    setNewDepartmentTranslation("");
    setDialogOpen(true);
  };

  const getDepartmentText = (name, translation) => {
    return lang === 'rs' ? (translation || name) : name;
  };

  const addPosition = () => {
    const trimmed = newPosition.trim();
    if (!trimmed) return;
    if (form.positions.some(p => typeof p === 'string' ? p === trimmed : p.name === trimmed)) { 
      toast.error(T("Position already exists")); 
      return; 
    }
    const positionObj = {
      name: trimmed,
      translation: newPositionTranslation.trim()
    };
    setForm((p) => ({ ...p, positions: [...p.positions, positionObj] }));
    setNewPosition("");
    setNewPositionTranslation("");
  };

  const removePosition = (pos) => {
    setForm((p) => ({ ...p, positions: p.positions.filter((x) => {
      return typeof x === 'string' ? x !== pos : x.name !== pos;
    }) }));
  };

  const startEditPosition = (pos) => {
    const posKey = typeof pos === 'string' ? pos : pos.name;
    const posName = typeof pos === 'string' ? pos : pos.name;
    const posTranslation = typeof pos === 'string' ? '' : (pos.translation || pos.name);
    setEditingPositionKey(posKey);
    setNewPosition(posName);
    setNewPositionTranslation(posTranslation);
  };

  const saveEditPosition = () => {
    if (!newPosition.trim() || !editingPositionKey) return;
    setForm((p) => ({
      ...p,
      positions: p.positions.map((x) => {
        const isMatch = typeof x === 'string' ? x === editingPositionKey : x.name === editingPositionKey;
        if (isMatch) {
          return { name: newPosition.trim(), translation: newPositionTranslation.trim() };
        }
        return x;
      })
    }));
    setEditingPositionKey(null);
    setNewPosition("");
    setNewPositionTranslation("");
  };

  const cancelEditPosition = () => {
    setEditingPositionKey(null);
    setNewPosition("");
    setNewPositionTranslation("");
  };

  const getPositionText = (pos) => {
    if (typeof pos === 'string') return pos;
    return lang === 'rs' ? (pos.translation || pos.name) : pos.name;
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(T("Department name is required")); return; }
    const normalizedPositions = form.positions.map(pos => 
      typeof pos === 'string' ? { name: pos, translation: '' } : pos
    );
    const dataToSave = { ...form, positions: normalizedPositions };
    if (editingDept) {
      await updateMutation.mutateAsync({ id: editingDept.id, data: dataToSave });
      toast.success(T("Department updated"));
    } else {
      await createMutation.mutateAsync(dataToSave);
      toast.success(T("Department created"));
    }
    setDialogOpen(false);
  };

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(deleteConfirmId);
    setDeleteConfirmId(null);
    toast.success(T("Department deleted"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <PageHeader
          title={T("Departments")}
          subtitle={T("Configure departments and their available positions")}
          actionLabel={T("Add Department")}
          onAction={openNew}
        />
        <div className="flex gap-2">
          <Button
            variant={viewMode === "grid" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("grid")}
            title={T("Grid view")}
          >
            <Grid3x3 className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="icon"
            onClick={() => setViewMode("list")}
            title={T("List view")}
          >
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className={viewMode === "grid" ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className={viewMode === "grid" ? "h-40 rounded-xl" : "h-20 rounded-xl"} />)}
        </div>
      ) : departments.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title={T("No departments yet")}
          description={T("Add your first department to start assigning positions to employees")}
          actionLabel={T("Add Department")}
          onAction={openNew}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <Card key={dept.id} className="p-5 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                     <h3 className="font-semibold text-base" title={dept.translation}>{getDepartmentText(dept.name, dept.translation)}</h3>
                     <p className="text-xs text-muted-foreground">{(dept.positions || []).length} {(dept.positions || []).length === 1 ? T("Position") : T("Positions")}</p>
                   </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(dept)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(dept.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(dept.positions || []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">{T("No positions added")}</p>
                  ) : (
                  (dept.positions || []).map((pos) => {
                    const posKey = typeof pos === 'string' ? pos : pos.name;
                    return (
                      <Badge key={posKey} variant="secondary" className="text-xs" title={typeof pos === 'string' ? '' : pos.translation}>
                        {getPositionText(pos)}
                      </Badge>
                    );
                  })
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {departments.map((dept) => (
            <Card key={dept.id} className="p-4 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-base" title={dept.translation}>{getDepartmentText(dept.name, dept.translation)}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(dept.positions || []).length} {(dept.positions || []).length === 1 ? T("Position") : T("Positions")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 mr-4 max-w-xs">
                  {(dept.positions || []).length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">{T("No positions added")}</span>
                  ) : (
                    (dept.positions || []).map((pos) => {
                      const posKey = typeof pos === 'string' ? pos : pos.name;
                      return (
                        <Badge key={posKey} variant="secondary" className="text-xs" title={typeof pos === 'string' ? '' : pos.translation}>
                          {getPositionText(pos)}
                        </Badge>
                      );
                    })
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(dept)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteConfirmId(dept.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{T("Are you sure?") || "Da li ste sigurni?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {T("Delete this department? This won't affect existing employees.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{T("Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {T("Delete") || "Obriši"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
           <DialogHeader>
             <DialogTitle>{editingDept ? T("Edit Department") : T("New Department")}</DialogTitle>
           </DialogHeader>
           <div className="space-y-4">
             <div className="space-y-2">
               <Label>{T("Department Name *")}</Label>
               <Input
                 value={form.name}
                 onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                 placeholder={T("e.g. Engineering, Sales, HR...")}
               />
               <Input
                 value={form.translation || ""}
                 onChange={(e) => setForm((p) => ({ ...p, translation: e.target.value }))}
                 placeholder={T("Translation (Serbian) - optional")}
               />
             </div>
             <div className="space-y-2">
               <Label>{T("Positions")}</Label>
               <div className="space-y-2">
                 <Input
                   value={newPosition}
                   onChange={(e) => setNewPosition(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), editingPositionKey ? saveEditPosition() : addPosition())}
                   placeholder={T("Position in English")}
                 />
                 <Input
                   value={newPositionTranslation}
                   onChange={(e) => setNewPositionTranslation(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), editingPositionKey ? saveEditPosition() : addPosition())}
                   placeholder={T("Translation (Serbian) - optional")}
                 />
                 <div className="flex gap-2">
                   <Button type="button" className="flex-1" onClick={editingPositionKey ? saveEditPosition : addPosition}>
                     {editingPositionKey ? (
                       <>
                         <Check className="w-4 h-4 mr-1" />
                         {T("Save Position")}
                       </>
                     ) : (
                       <>
                         <Plus className="w-4 h-4 mr-1" />
                         {T("Add Position")}
                       </>
                     )}
                   </Button>
                   {editingPositionKey && (
                     <Button type="button" variant="outline" onClick={cancelEditPosition}>
                       {T("Cancel")}
                     </Button>
                   )}
                 </div>
              </div>
              {form.positions.length > 0 && (
                <div className="space-y-2 mt-3 max-h-64 overflow-y-auto border border-input rounded-lg p-2">
                  {form.positions.map((pos) => {
                    const posKey = typeof pos === 'string' ? pos : pos.name;
                    return (
                      <div key={posKey} className={`flex items-center justify-between p-2 rounded-md transition-colors ${editingPositionKey === posKey ? 'bg-primary/10 border border-primary' : 'bg-muted/40 hover:bg-muted/60'}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{getPositionText(pos)}</p>
                          {typeof pos !== 'string' && pos.translation && (
                            <p className="text-xs text-muted-foreground truncate">{pos.name}</p>
                          )}
                        </div>
                        <div className="flex gap-1 ml-2 flex-shrink-0">
                          <button onClick={() => startEditPosition(pos)} className="p-1 hover:bg-accent rounded" title={T("Edit")}>
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button onClick={() => removePosition(posKey)} className="p-1 hover:bg-destructive/10 text-destructive rounded" title={T("Delete")}>
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
             </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{T("Cancel")}</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              <Check className="w-4 h-4 mr-1" />
              {editingDept ? T("Save Changes") : T("Create Department")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}