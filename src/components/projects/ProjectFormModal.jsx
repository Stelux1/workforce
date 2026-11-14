import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useL } from "@/lib/translations";

const EMPTY = {
  project_number: "", name: "", client_name: "", location: "",
  start_date: "", end_date: "", status: "active", description: "",
};

export default function ProjectFormModal({ project, onClose, onSaved }) {
  const L = useL();
  const [form, setForm] = useState(project ? {
    project_number: project.project_number || "",
    name: project.name || "",
    client_name: project.client_name || "",
    location: project.location || "",
    start_date: project.start_date || "",
    end_date: project.end_date || "",
    status: project.status || "active",
    description: project.description || "",
  } : EMPTY);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => base44.entities.Client.list(),
  });

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const saveMutation = useMutation({
    mutationFn: () =>
      project
        ? base44.entities.Project.update(project.id, form)
        : base44.entities.Project.create(form),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? L("Edit project", "Uredi projekat") : L("New project", "Novi projekat")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{L("Project number", "Broj projekta")}</Label>
              <Input value={form.project_number} onChange={(e) => set("project_number", e.target.value)} placeholder={L("e.g. PRJ-2026-001", "npr. PRJ-2026-001")} className="mt-1" />
            </div>
            <div>
              <Label>{L("Project name *", "Naziv projekta *")}</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={L("Project name", "Naziv projekta")} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{L("Client", "Klijent")}</Label>
              <Select value={form.client_name} onValueChange={(v) => set("client_name", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={L("Select client", "Odaberi klijenta")} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{L("Location", "Lokacija")}</Label>
              <Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder={L("Work location", "Lokacija radova")} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{L("Start date", "Datum početka")}</Label>
              <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{L("End date", "Rok završetka")}</Label>
              <Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className="mt-1" />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{L("Active", "Aktivan")}</SelectItem>
                <SelectItem value="paused">{L("Paused", "Pauziran")}</SelectItem>
                <SelectItem value="completed">{L("Completed", "Završen")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{L("Work description", "Opis radova")}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={L("Description of the project and work...", "Opis projekta i radova...")}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{L("Cancel", "Odustani")}</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending}>
            {saveMutation.isPending ? L("Saving...", "Čuvanje...") : L("Save", "Sačuvaj")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}