import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import ConfirmDeleteDialog from "@/components/shared/ConfirmDeleteDialog";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Plus, X, Pencil, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

import { useL } from "@/lib/translations";

const emptyRole = { title: "", b2b_rate: "" };

export default function ProjectRoles({ project, onUpdated }) {
  const L = useL();
  const [showAdd, setShowAdd] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [form, setForm] = useState(emptyRole);
  const [deleteIndex, setDeleteIndex] = useState(null);

  const { data: departments = [] } = useQuery({
    queryKey: ["department-configs"],
    queryFn: () => base44.entities.DepartmentConfig.list("name", 200),
  });

  const availablePositions = departments.flatMap(d => 
    (d.positions || []).map(pos => {
      if (typeof pos === 'string') return pos;
      return pos.translation || pos.name;
    })
  );

  const roles = project.job_roles || [];

  const updateMutation = useMutation({
    mutationFn: (newRoles) =>
      base44.entities.Project.update(project.id, { job_roles: newRoles }),
    onSuccess: () => {
      onUpdated();
      setShowAdd(false);
      setEditIndex(null);
      setForm(emptyRole);
    },
  });

  const openAdd = () => {
    setForm(emptyRole);
    setEditIndex(null);
    setShowAdd(true);
  };

  const openEdit = (idx) => {
    setForm({ ...roles[idx], b2b_rate: roles[idx].b2b_rate ?? "" });
    setEditIndex(idx);
    setShowAdd(true);
  };

  const handleSave = () => {
    if (!form.title) return;
    const b2b = parseFloat(form.b2b_rate);
    if (!(b2b > 0)) {
      toast.error(L("B2B rate must be greater than 0.", "B2B tarifa mora biti veća od 0."));
      return;
    }
    if (roles.some((r, i) => i !== editIndex && r.title === form.title)) {
      toast.error(L("This job role already exists on the project.", "Ovo zanimanje već postoji na projektu."));
      return;
    }
    // Izmena zadržava ostala polja pozicije (ranije je brisala B2C, QA §9.3 #6).
    const entry = { ...(editIndex !== null ? roles[editIndex] : {}), title: form.title, b2b_rate: b2b };
    if (editIndex !== null) {
      const updated = roles.map((r, i) => (i === editIndex ? entry : r));
      updateMutation.mutate(updated);
    } else {
      updateMutation.mutate([...roles, entry]);
    }
  };

  const handleDelete = (idx) => {
    updateMutation.mutate(roles.filter((_, i) => i !== idx));
  };

  return (
    <div className="bg-card border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-primary" />
          <h2 className="font-semibold">{L("Job roles and rates", "Zanimanja i tarife")}</h2>
          <Badge variant="secondary">{roles.length}</Badge>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4" />
          {L("Add job role", "Dodaj zanimanje")}
        </Button>
      </div>

      {roles.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm">
          <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>{L("No job roles defined", "Nema definisanih zanimanja")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2 px-3 text-xs text-muted-foreground font-medium">
            <span>{L("Job role", "Zanimanje")}</span>
            <span>{L("B2B rate (client)", "B2B tarifa (klijent)")}</span>
            <span></span>
          </div>
          {roles.map((role, idx) => (
            <div key={idx} className="grid grid-cols-3 gap-2 items-center p-3 rounded-lg bg-muted/40 border text-sm">
              <span className="font-medium">{role.title}</span>
              <span className="text-muted-foreground">€{role.b2b_rate}/h</span>
              <div className="flex items-center gap-1 justify-end">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(idx)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteIndex(idx)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o) { setShowAdd(false); setEditIndex(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editIndex !== null ? L("Edit job role", "Uredi zanimanje") : L("Add job role", "Dodaj zanimanje")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{L("Job role name *", "Naziv zanimanja *")}</Label>
              <select
                className="w-full mt-1 h-9 rounded-md border border-input px-3 py-1 text-sm"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              >
                <option value="">{L("Select job role", "Odaberi zanimanje")}</option>
                {availablePositions.map((pos, idx) => (
                  <option key={idx} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>{L("B2B rate (€/h) *", "B2B tarifa (€/h) *")}</Label>
              <Input
                className="mt-1"
                type="number"
                min="0"
                step="0.5"
                value={form.b2b_rate}
                onChange={(e) => setForm((p) => ({ ...p, b2b_rate: e.target.value }))}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground mt-1">{L("Rate charged to the client", "Tarifa prema klijentu")}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdd(false); setEditIndex(null); }}>{L("Cancel", "Odustani")}</Button>
            <Button onClick={handleSave} disabled={!form.title || !form.b2b_rate || updateMutation.isPending}>
              <Check className="w-4 h-4 mr-1" />
              {editIndex !== null ? L("Save", "Sačuvaj") : L("Add", "Dodaj")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDeleteDialog
        open={deleteIndex !== null}
        onClose={() => setDeleteIndex(null)}
        onConfirm={() => handleDelete(deleteIndex)}
        message={L(`Remove job role "${roles[deleteIndex]?.title || ""}" from the project? Employees already added keep their rate.`, `Obrisati zanimanje „${roles[deleteIndex]?.title || ""}" sa projekta? Radnici koji su već dodati zadržavaju svoju tarifu.`)}
      />
    </div>
  );
}