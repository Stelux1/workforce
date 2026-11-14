import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/**
 * Module-level component on purpose: declaring this inside the Clients page
 * recreated the component type on every keystroke and remounted the inputs,
 * which is what caused the focus loss.
 */
export default function ClientDialog({ open, onOpenChange, form, setForm, onSave, isSaving, t }) {
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{form.id ? t("Edit") : "Add"} Client</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2 col-span-2">
              <Label>{t("Name")} *</Label>
              <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("Contact Name") || "Contact Name"}</Label>
              <Input value={form.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("Email")}</Label>
              <Input value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("Phone")}</Label>
              <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("B2B Rate") || "Default B2B Rate (€/h)"}</Label>
              <Input type="number" value={form.default_b2b_rate || ""} onChange={(e) => set("default_b2b_rate", parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>{t("VAT Number") || "VAT Number"}</Label>
              <Input value={form.vat_number || ""} onChange={(e) => set("vat_number", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t("Payment Terms") || "Payment Terms"}</Label>
              <Input placeholder="e.g. Net 30" value={form.payment_terms || ""} onChange={(e) => set("payment_terms", e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>{t("Address")}</Label>
              <Input value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>{t("Notes")}</Label>
              <Textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button onClick={onSave} disabled={isSaving}>{t("Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}