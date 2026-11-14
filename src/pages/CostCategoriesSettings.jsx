import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, X, Settings2, Pencil, Check, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";

export default function CostCategoriesSettings() {
  const L = useL();
  const { lang } = useLang();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState({ name: "", translation: "", subcategories: [] });
  const [newSub, setNewSub] = useState("");
  const [newSubTranslation, setNewSubTranslation] = useState("");
  const [editingSubKey, setEditingSubKey] = useState(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["cost-categories"],
    queryFn: () => base44.entities.CostCategory.list("name", 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CostCategory.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cost-categories"] }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CostCategory.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cost-categories"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CostCategory.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cost-categories"] }); },
  });

  const openNew = () => {
    setEditingCategory(null);
    setForm({ name: "", translation: "", subcategories: [] });
    setNewSub("");
    setNewSubTranslation("");
    setEditingSubKey(null);
    setDialogOpen(true);
  };

  const openEdit = (cat) => {
    setEditingCategory(cat);
    setForm({ name: cat.name, translation: cat.translation || "", subcategories: cat.subcategories || [] });
    setNewSub("");
    setNewSubTranslation("");
    setEditingSubKey(null);
    setDialogOpen(true);
  };

  const getCategoryText = (cat) => lang === "rs" ? (cat.translation || cat.name) : cat.name;
  const getSubText = (sub) => lang === "rs" ? (sub.translation || sub.name) : sub.name;

  const addSubcategory = () => {
    const trimmed = newSub.trim();
    if (!trimmed) return;
    if (form.subcategories.some(s => s.name === trimmed)) { toast.error(L("Subcategory already exists", "Podkategorija već postoji")); return; }
    setForm(p => ({ ...p, subcategories: [...p.subcategories, { name: trimmed, translation: newSubTranslation.trim() }] }));
    setNewSub("");
    setNewSubTranslation("");
  };

  const removeSubcategory = (name) => {
    setForm(p => ({ ...p, subcategories: p.subcategories.filter(s => s.name !== name) }));
  };

  const startEditSub = (sub) => {
    setEditingSubKey(sub.name);
    setNewSub(sub.name);
    setNewSubTranslation(sub.translation || sub.name);
  };

  const saveEditSub = () => {
    if (!newSub.trim() || !editingSubKey) return;
    setForm(p => ({
      ...p,
      subcategories: p.subcategories.map(s =>
        s.name === editingSubKey ? { name: newSub.trim(), translation: newSubTranslation.trim() } : s
      )
    }));
    setEditingSubKey(null);
    setNewSub("");
    setNewSubTranslation("");
  };

  const cancelEditSub = () => {
    setEditingSubKey(null);
    setNewSub("");
    setNewSubTranslation("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(L("Category name is required", "Naziv kategorije je obavezan")); return; }
    if (editingCategory) {
      await updateMutation.mutateAsync({ id: editingCategory.id, data: form });
      toast.success(L("Category updated", "Kategorija ažurirana"));
    } else {
      await createMutation.mutateAsync(form);
      toast.success(L("Category created", "Kategorija kreirana"));
    }
    setDialogOpen(false);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [viewMode, setViewMode] = useState("grid");

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(deleteConfirmId);
    setDeleteConfirmId(null);
    toast.success(L("Category deleted", "Kategorija obrisana"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={L("Cost Categories", "Kategorije troškova")}
          subtitle={L("Configure cost categories for projects", "Konfigurišite kategorije troškova za projekte")}
          actionLabel={L("Add Category", "Dodaj kategoriju")}
          onAction={openNew}
        />
        <div className="flex items-center gap-1 border rounded-lg p-1 mt-1">
          <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => setViewMode("grid")}>
            <LayoutGrid className="w-4 h-4" />
          </Button>
          <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-7 w-7" onClick={() => setViewMode("list")}>
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title={L("No categories", "Nema kategorija")}
          description={L("Add your first cost category", "Dodajte prvu kategoriju troškova")}
          actionLabel={L("Add Category", "Dodaj kategoriju")}
          onAction={openNew}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card key={cat.id} className="p-5 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-base">{getCategoryText(cat)}</h3>
                  <p className="text-xs text-muted-foreground">
                    {(cat.subcategories || []).length} {lang === "rs" ? "podkategorija" : "subcategories"}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirmId(cat.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(cat.subcategories || []).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">{lang === "rs" ? "Nema podkategorija" : "No subcategories"}</p>
                ) : (
                  (cat.subcategories || []).map((sub) => (
                    <Badge key={sub.name} variant="secondary" className="text-xs" title={sub.translation}>
                      {getSubText(sub)}
                    </Badge>
                  ))
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <Card key={cat.id} className="p-4 hover:shadow-md transition-all">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-base">{getCategoryText(cat)}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(cat.subcategories || []).length} {lang === "rs" ? "podkategorija" : "subcategories"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 mr-4 max-w-xs">
                  {(cat.subcategories || []).length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">{lang === "rs" ? "Nema podkategorija" : "No subcategories"}</span>
                  ) : (
                    (cat.subcategories || []).map((sub) => (
                      <Badge key={sub.name} variant="secondary" className="text-xs" title={sub.translation}>
                        {getSubText(sub)}
                      </Badge>
                    ))
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirmId(cat.id)}
                    disabled={deleteMutation.isPending}
                  >
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
            <AlertDialogTitle>{lang === "rs" ? "Da li ste sigurni?" : "Are you sure?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "rs" ? "Ova akcija će trajno obrisati kategoriju i ne može se poništiti." : "This action will permanently delete the category and cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "rs" ? "Otkaži" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "rs" ? "Obriši" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? L("Edit Category", "Uredi kategoriju") : L("New Category", "Nova kategorija")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{L("Category Name", "Naziv kategorije")} (EN) *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder={L("e.g. Materials, Equipment...", "npr. Materials, Equipment...")}
              />
              <Input
                value={form.translation}
                onChange={(e) => setForm(p => ({ ...p, translation: e.target.value }))}
                placeholder={L("e.g. Materijali, Oprema... (RS)", "npr. Materijali, Oprema... (RS)")}
              />
            </div>

            <div className="space-y-2">
              <Label>{lang === "rs" ? "Podkategorije" : "Subcategories"}</Label>
              <div className="space-y-2">
                <Input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), editingSubKey ? saveEditSub() : addSubcategory())}
                  placeholder={lang === "rs" ? "Podkategorija (EN)" : "Subcategory (EN)"}
                />
                <Input
                  value={newSubTranslation}
                  onChange={(e) => setNewSubTranslation(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), editingSubKey ? saveEditSub() : addSubcategory())}
                  placeholder={lang === "rs" ? "Prevod (RS) - opciono" : "Translation (RS) - optional"}
                />
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={editingSubKey ? saveEditSub : addSubcategory}>
                    {editingSubKey ? (
                      <><Check className="w-4 h-4 mr-1" />{lang === "rs" ? "Sačuvaj" : "Save"}</>
                    ) : (
                      <><Plus className="w-4 h-4 mr-1" />{lang === "rs" ? "Dodaj podkategoriju" : "Add Subcategory"}</>
                    )}
                  </Button>
                  {editingSubKey && (
                    <Button type="button" variant="outline" onClick={cancelEditSub}>{L("Cancel", "Otkaži")}</Button>
                  )}
                </div>
              </div>

              {form.subcategories.length > 0 && (
                <div className="space-y-2 mt-3 max-h-64 overflow-y-auto border border-input rounded-lg p-2">
                  {form.subcategories.map((sub) => (
                    <div
                      key={sub.name}
                      className={`flex items-center justify-between p-2 rounded-md transition-colors ${editingSubKey === sub.name ? "bg-primary/10 border border-primary" : "bg-muted/40 hover:bg-muted/60"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getSubText(sub)}</p>
                        {sub.translation && sub.translation !== sub.name && (
                          <p className="text-xs text-muted-foreground truncate">{sub.name}</p>
                        )}
                      </div>
                      <div className="flex gap-1 ml-2 flex-shrink-0">
                        <button onClick={() => startEditSub(sub)} className="p-1 hover:bg-accent rounded">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => removeSubcategory(sub.name)} className="p-1 hover:bg-destructive/10 text-destructive rounded">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{L("Cancel", "Otkaži")}</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              <Check className="w-4 h-4 mr-1" />
              {editingCategory ? L("Save Changes", "Sačuvaj") : L("Create Category", "Kreiraj")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}