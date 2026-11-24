import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, X, Settings2, Pencil, Check, LayoutGrid, List, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import { toast } from "sonner";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { useAuth } from "@/lib/AuthContext";

// Podkategorija je objekat { name, … }; stari zapisi mogu biti samo string.
const toSubObject = (sub) => (typeof sub === "string" ? { name: sub } : sub);

export default function CostCategoriesSettings() {
  const L = useL();
  const { lang } = useLang();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [form, setForm] = useState({ name: "", subcategories: [] });
  const [newSub, setNewSub] = useState("");
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

  // Vraća samo obrisane podrazumevane kategorije (sa slika 8/9); postojeće ne dira. Samo admin (proverava i baza).
  const restoreMutation = useMutation({
    mutationFn: () => base44.rpc("restore_default_cost_categories"),
    onSuccess: (added) => {
      queryClient.invalidateQueries({ queryKey: ["cost-categories"] });
      if (added > 0) toast.success(`${L("Default categories restored", "Vraćene podrazumevane kategorije", "Obnovené predvolené kategórie")}: ${added}`);
      else toast.info(L("All default categories already exist", "Sve podrazumevane kategorije već postoje", "Všetky predvolené kategórie už existujú"));
    },
  });

  const openNew = () => {
    setEditingCategory(null);
    setForm({ name: "", subcategories: [] });
    setNewSub("");
    setEditingSubKey(null);
    setDialogOpen(true);
  };

  const openEdit = (cat) => {
    setEditingCategory(cat);
    setForm({ name: cat.name, subcategories: (cat.subcategories || []).map(toSubObject) });
    setNewSub("");
    setEditingSubKey(null);
    setDialogOpen(true);
  };


  const addSubcategory = () => {
    const trimmed = newSub.trim();
    if (!trimmed) return;
    if (form.subcategories.some(s => s.name === trimmed)) { toast.error(L("Subcategory already exists", "Podkategorija već postoji", "Podkategória už existuje")); return; }
    setForm(p => ({ ...p, subcategories: [...p.subcategories, { name: trimmed }] }));
    setNewSub("");
  };

  const removeSubcategory = (name) => {
    setForm(p => ({ ...p, subcategories: p.subcategories.filter(s => s.name !== name) }));
  };

  const startEditSub = (sub) => {
    setEditingSubKey(sub.name);
    setNewSub(sub.name);
  };

  const saveEditSub = () => {
    const trimmed = newSub.trim();
    if (!trimmed || !editingSubKey) return;
    if (trimmed !== editingSubKey && form.subcategories.some(s => s.name === trimmed)) {
      toast.error(L("Subcategory already exists", "Podkategorija već postoji", "Podkategória už existuje"));
      return;
    }
    // Ostala polja podkategorije (npr. stari prevod) ostaju u bazi — menja se samo naziv.
    setForm(p => ({
      ...p,
      subcategories: p.subcategories.map(s => (s.name === editingSubKey ? { ...s, name: trimmed } : s))
    }));
    setEditingSubKey(null);
    setNewSub("");
  };

  const cancelEditSub = () => {
    setEditingSubKey(null);
    setNewSub("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error(L("Category name is required", "Naziv kategorije je obavezan", "Názov kategórie je povinný")); return; }
    // Kolona `translation` ostaje u bazi (bez gubitka podataka), ali se više ne unosi ni prikazuje (zahtev 6).
    const data = { name: form.name.trim(), subcategories: form.subcategories };
    if (editingCategory) {
      await updateMutation.mutateAsync({ id: editingCategory.id, data });
      toast.success(L("Category updated", "Kategorija ažurirana", "Kategória bola aktualizovaná"));
    } else {
      await createMutation.mutateAsync(data);
      toast.success(L("Category created", "Kategorija kreirana", "Kategória bola vytvorená"));
    }
    setDialogOpen(false);
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [viewMode, setViewMode] = useState("grid");

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(deleteConfirmId);
    setDeleteConfirmId(null);
    toast.success(L("Category deleted", "Kategorija obrisana", "Kategória bola odstránená"));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={L("Cost Categories", "Kategorije troškova", "Kategórie nákladov")}
          subtitle={L("Configure cost categories for projects", "Konfigurišite kategorije troškova za projekte", "Nastavte kategórie nákladov pre projekty")}
          actionLabel={L("Add Category", "Dodaj kategoriju", "Pridať kategóriu")}
          onAction={openNew}
        >
          {isAdmin && (
            <Button variant="outline" className="gap-2" onClick={() => restoreMutation.mutate()} disabled={restoreMutation.isPending}>
              <RotateCcw className="w-4 h-4" />
              {L("Restore default categories", "Vrati podrazumevane kategorije", "Obnoviť predvolené kategórie")}
            </Button>
          )}
        </PageHeader>
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
          title={L("No categories", "Nema kategorija", "Žiadne kategórie")}
          description={L("Add your first cost category", "Dodajte prvu kategoriju troškova", "Pridajte prvú kategóriu nákladov")}
          actionLabel={L("Add Category", "Dodaj kategoriju", "Pridať kategóriu")}
          onAction={openNew}
        />
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Card key={cat.id} className="p-5 hover:shadow-md transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-base">{cat.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {(cat.subcategories || []).length} {lang === "rs" ? "podkategorija" : lang === "sk" ? "podkategórií" : "subcategories"}
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
                  <p className="text-xs text-muted-foreground italic">{lang === "rs" ? "Nema podkategorija" : lang === "sk" ? "Žiadne podkategórie" : "No subcategories"}</p>
                ) : (
                  (cat.subcategories || []).map(toSubObject).map((sub) => (
                    <Badge key={sub.name} variant="secondary" className="text-xs">
                      {sub.name}
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
                  <h3 className="font-semibold text-base">{cat.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(cat.subcategories || []).length} {lang === "rs" ? "podkategorija" : lang === "sk" ? "podkategórií" : "subcategories"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1 mr-4 max-w-xs">
                  {(cat.subcategories || []).length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">{lang === "rs" ? "Nema podkategorija" : lang === "sk" ? "Žiadne podkategórie" : "No subcategories"}</span>
                  ) : (
                    (cat.subcategories || []).map(toSubObject).map((sub) => (
                      <Badge key={sub.name} variant="secondary" className="text-xs">
                        {sub.name}
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
            <AlertDialogTitle>{lang === "rs" ? "Da li ste sigurni?" : lang === "sk" ? "Ste si istý?" : "Are you sure?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "rs" ? "Ova akcija će trajno obrisati kategoriju i ne može se poništiti." : lang === "sk" ? "Táto akcia natrvalo odstráni kategóriu a nemožno ju vrátiť späť." : "This action will permanently delete the category and cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{lang === "rs" ? "Otkaži" : lang === "sk" ? "Zrušiť" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {lang === "rs" ? "Obriši" : lang === "sk" ? "Odstrániť" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? L("Edit Category", "Uredi kategoriju", "Upraviť kategóriu") : L("New Category", "Nova kategorija", "Nová kategória")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{L("Category Name", "Naziv kategorije", "Názov kategórie")} *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder={L("e.g. Materials, Equipment...", "npr. Materials, Equipment...", "napr. Materiály, Vybavenie...")}
              />
            </div>

            <div className="space-y-2">
              <Label>{lang === "rs" ? "Podkategorije" : lang === "sk" ? "Podkategórie" : "Subcategories"}</Label>
              <div className="space-y-2">
                <Input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), editingSubKey ? saveEditSub() : addSubcategory())}
                  placeholder={L("Subcategory name", "Naziv podkategorije", "Názov podkategórie")}
                />
                <div className="flex gap-2">
                  <Button type="button" className="flex-1" onClick={editingSubKey ? saveEditSub : addSubcategory}>
                    {editingSubKey ? (
                      <><Check className="w-4 h-4 mr-1" />{lang === "rs" ? "Sačuvaj" : lang === "sk" ? "Uložiť" : "Save"}</>
                    ) : (
                      <><Plus className="w-4 h-4 mr-1" />{lang === "rs" ? "Dodaj podkategoriju" : lang === "sk" ? "Pridať podkategóriu" : "Add Subcategory"}</>
                    )}
                  </Button>
                  {editingSubKey && (
                    <Button type="button" variant="outline" onClick={cancelEditSub}>{L("Cancel", "Otkaži", "Zrušiť")}</Button>
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
                        <p className="text-sm font-medium truncate">{sub.name}</p>
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{L("Cancel", "Otkaži", "Zrušiť")}</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              <Check className="w-4 h-4 mr-1" />
              {editingCategory ? L("Save Changes", "Sačuvaj", "Uložiť zmeny") : L("Create Category", "Kreiraj", "Vytvoriť")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}