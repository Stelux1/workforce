import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { documentTypeOptions } from "@/lib/documentCategories";

const ALL_ROLES = "__all__";

export function validityRuleLabel(rule, L) {
  if (rule === "assignment_start") return L("Valid on assignment start", "Važi na početku angažmana", "Platný na začiatku pridelenia");
  if (rule === "none") return L("Valid today", "Važi danas", "Platný dnes");
  return L("Valid for the whole assignment", "Važi ceo period angažmana", "Platný počas celého pridelenia");
}

// Zahtev za dokument na projektu (spec §12.1): vrsta, uloga (ili sve uloge), obaveznost, period važenja, izvoz.
export default function RequiredDocumentDialog({ open, onClose, onSaved, projectId, roles, documentTypes, requirement }) {
  const L = useL();
  const { lang } = useLang();
  const [form, setForm] = useState(() => ({
    document_type: requirement?.document_type || "",
    project_role_id: requirement?.project_role_id || ALL_ROLES,
    mandatory: requirement ? requirement.mandatory : true,
    validity_rule: requirement?.validity_rule || "assignment_period",
    expiring_soon_days: requirement?.expiring_soon_days ?? 30,
    exportable: requirement ? requirement.exportable : true,
    notes: requirement?.notes || "",
  }));
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        project_id: projectId,
        project_role_id: form.project_role_id === ALL_ROLES ? null : form.project_role_id,
        expiring_soon_days: Math.max(0, Math.round(Number(form.expiring_soon_days) || 0)),
        notes: form.notes.trim() || null,
      };
      return requirement
        ? base44.entities.RequiredDocument.update(requirement.id, payload)
        : base44.entities.RequiredDocument.create(payload);
    },
    onSuccess: () => {
      toast.success(L("Required document saved", "Zahtev za dokument je sačuvan", "Požadovaný dokument bol uložený"));
      onSaved?.();
      onClose();
    },
  });

  const types = documentTypeOptions(documentTypes, lang, requirement?.document_type);
  const activeRoles = (roles || []).filter((r) => r.status !== "inactive" || r.id === requirement?.project_role_id);
  const valid = form.document_type && Number(form.expiring_soon_days) >= 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {requirement ? L("Edit required document", "Izmena zahteva za dokument", "Upraviť požadovaný dokument")
              : L("Add required document", "Novi zahtev za dokument", "Pridať požadovaný dokument")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rq-type">{L("Document type", "Vrsta dokumenta", "Typ dokumentu")} *</Label>
            <Select value={form.document_type} onValueChange={(v) => set("document_type", v)}>
              <SelectTrigger id="rq-type"><SelectValue placeholder={L("Select type", "Izaberite vrstu", "Vyberte typ")} /></SelectTrigger>
              <SelectContent>
                {types.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}{t.sensitive ? ` · ${L("sensitive", "osetljiv", "citlivý")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-role">{L("Job Role", "Job Role", "Pracovná pozícia")}</Label>
            <Select value={form.project_role_id} onValueChange={(v) => set("project_role_id", v)}>
              <SelectTrigger id="rq-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROLES}>{L("All roles on the project", "Sve uloge na projektu", "Všetky pozície na projekte")}</SelectItem>
                {activeRoles.map((r) => <SelectItem key={r.id} value={r.id}>{r.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {L("A role-specific requirement applies only to workers assigned to that role (e.g. a welding certificate for a Welder).",
                "Zahtev za ulogu važi samo za radnike na toj ulozi (npr. sertifikat za zavarivača).",
                "Požiadavka pre pozíciu platí len pre pracovníkov na tejto pozícii (napr. zváračský certifikát).")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-validity">{L("Validity", "Važenje", "Platnosť")}</Label>
            <Select value={form.validity_rule} onValueChange={(v) => set("validity_rule", v)}>
              <SelectTrigger id="rq-validity"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["assignment_period", "assignment_start", "none"].map((r) => (
                  <SelectItem key={r} value={r}>{validityRuleLabel(r, L)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-soon">{L("Warn when expiring within (days)", "Upozori kad ističe za (dana)", "Upozorniť pri skončení do (dní)")}</Label>
            <Input id="rq-soon" type="number" min={0} step={1} value={form.expiring_soon_days}
              onChange={(e) => set("expiring_soon_days", e.target.value)} className="w-32" />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="rq-mandatory">{L("Mandatory", "Obavezan", "Povinný")}</Label>
              <p className="text-xs text-muted-foreground">{L("A missing or invalid mandatory document blocks Ready for Onboarding.",
                "Obavezan dokument koji fali ili ne važi blokira status „Spreman za onboarding“.",
                "Chýbajúci alebo neplatný povinný dokument blokuje stav Pripravený.")}</p>
            </div>
            <Switch id="rq-mandatory" checked={form.mandatory} onCheckedChange={(v) => set("mandatory", v)} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="rq-export">{L("Allowed in ZIP export", "Dozvoljen u ZIP izvozu", "Povolený v ZIP exporte")}</Label>
              <p className="text-xs text-muted-foreground">{L("If off, the document is checked but never included in a package.",
                "Ako je isključeno, dokument se proverava, ali nikad ne ulazi u paket.",
                "Ak je vypnuté, dokument sa kontroluje, ale nikdy nie je v balíku.")}</p>
            </div>
            <Switch id="rq-export" checked={form.exportable} onCheckedChange={(v) => set("exportable", v)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rq-notes">{L("Notes", "Napomena", "Poznámka")}</Label>
            <Textarea id="rq-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{L("Cancel", "Otkaži", "Zrušiť")}</Button>
          <Button onClick={() => save.mutate()} disabled={!valid || save.isPending}>{L("Save", "Sačuvaj", "Uložiť")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
