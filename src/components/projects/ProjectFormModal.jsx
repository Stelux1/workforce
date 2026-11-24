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
import { formatAddress } from "@/lib/companyDetails";

const EMPTY = {
  project_number: "", name: "", client_name: "", address: "", zip: "", city: "",
  start_date: "", end_date: "", status: "active", description: "",
};

const noAddress = (p) => ![p.address, p.zip, p.city].some((v) => v && String(v).trim());

export default function ProjectFormModal({ project, onClose, onSaved }) {
  const L = useL();
  const [form, setForm] = useState(project ? {
    project_number: project.project_number || "",
    name: project.name || "",
    client_name: project.client_name || "",
    address: project.address || "",
    zip: project.zip || "",
    // Projekat sa samo starim tekstom lokacije: tekst ide u grad, da se ne izgubi pri čuvanju.
    city: project.city || (noAddress(project) ? project.location || "" : ""),
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

  // `location` ostaje sastavljena adresa („Address, ZIP City") za stari kod i izveštaje koji je čitaju.
  const payload = () => {
    const clean = (v) => (v || "").trim() || null;
    const address = { address: clean(form.address), zip: clean(form.zip), city: clean(form.city) };
    return { ...form, ...address, location: formatAddress(address) || null };
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      project
        ? base44.entities.Project.update(project.id, payload())
        : base44.entities.Project.create(payload()),
    onSuccess: onSaved,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{project ? L("Edit project", "Uredi projekat", "Upraviť projekt") : L("New project", "Novi projekat", "Nový projekt")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{L("Project number", "Broj projekta", "Číslo projektu")}</Label>
              <Input value={form.project_number} onChange={(e) => set("project_number", e.target.value)} placeholder={L("e.g. PRJ-2026-001", "npr. PRJ-2026-001", "napr. PRJ-2026-001")} className="mt-1" />
            </div>
            <div>
              <Label>{L("Project name *", "Naziv projekta *", "Názov projektu *")}</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={L("Project name", "Naziv projekta", "Názov projektu")} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{L("Client", "Klijent", "Klient")}</Label>
              <Select value={form.client_name} onValueChange={(v) => set("client_name", v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={L("Select client", "Odaberi klijenta", "Vyberte klienta")} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{L("Address", "Adresa", "Adresa")}</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder={L("Street and number", "Ulica i broj", "Ulica a číslo")} className="mt-1" autoComplete="off" data-testid="project-address" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{L("ZIP", "Poštanski broj", "PSČ")}</Label>
              <Input value={form.zip} onChange={(e) => set("zip", e.target.value)} placeholder={L("e.g. 2040", "npr. 2040", "napr. 2040")} className="mt-1" maxLength={12} autoComplete="off" data-testid="project-zip" />
            </div>
            <div>
              <Label>{L("City", "Grad", "Mesto")}</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder={L("City", "Grad", "Mesto")} className="mt-1" autoComplete="off" data-testid="project-city" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{L("Start date", "Datum početka", "Dátum začiatku")}</Label>
              <Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>{L("End date", "Rok završetka", "Termín ukončenia")}</Label>
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
                <SelectItem value="active">{L("Active", "Aktivan", "Aktívny")}</SelectItem>
                <SelectItem value="paused">{L("Paused", "Pauziran", "Pozastavený")}</SelectItem>
                <SelectItem value="completed">{L("Completed", "Završen", "Dokončený")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{L("Work description", "Opis radova", "Popis prác")}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder={L("Description of the project and work...", "Opis projekta i radova...", "Popis projektu a prác...")}
              rows={3}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{L("Cancel", "Odustani", "Zrušiť")}</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending}>
            {saveMutation.isPending ? L("Saving...", "Čuvanje...", "Ukladá sa...") : L("Save", "Sačuvaj", "Uložiť")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}