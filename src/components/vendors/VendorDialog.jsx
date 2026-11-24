import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CURRENCIES } from "@/lib/rateEngine";
import { useT } from "@/lib/translations";

const LABELS = {
  en: {
    add: "Add Vendor", edit: "Edit Vendor", name: "Vendor Name", legal: "Legal Name", vendorId: "Vendor ID",
    reg: "Registration No.", tax: "Tax No.", vat: "VAT No.", country: "Country", city: "City",
    postal: "Postal Code", address: "Address", contact: "Contact Name", email: "Email", phone: "Phone",
    currency: "Default Currency", terms: "Payment Terms", cycle: "Settlement Cycle", contract: "Contract Ref.",
    status: "Status", notes: "Notes", active: "Active", inactive: "Inactive", save: "Save", cancel: "Cancel",
    weekly: "Weekly", biweekly: "Bi-weekly", monthly: "Monthly",
  },
  rs: {
    add: "Dodaj dobavljača", edit: "Uredi dobavljača", name: "Naziv dobavljača", legal: "Pravni naziv", vendorId: "Šifra dobavljača",
    reg: "Matični broj", tax: "PIB", vat: "PDV broj", country: "Država", city: "Grad",
    postal: "Poštanski broj", address: "Adresa", contact: "Kontakt osoba", email: "Email", phone: "Telefon",
    currency: "Valuta ugovora", terms: "Rok plaćanja", cycle: "Ciklus obračuna", contract: "Broj ugovora",
    status: "Status", notes: "Napomene", active: "Aktivan", inactive: "Neaktivan", save: "Sačuvaj", cancel: "Otkaži",
    weekly: "Nedeljno", biweekly: "Dvonedeljno", monthly: "Mesečno",
  },
  sk: {
    add: "Pridať dodávateľa", edit: "Upraviť dodávateľa", name: "Názov dodávateľa", legal: "Obchodné meno", vendorId: "ID dodávateľa",
    reg: "IČO", tax: "Daňové číslo", vat: "IČ DPH", country: "Krajina", city: "Mesto",
    postal: "PSČ", address: "Adresa", contact: "Kontaktná osoba", email: "E-mail", phone: "Telefón",
    currency: "Predvolená mena", terms: "Platobné podmienky", cycle: "Cyklus vyúčtovania", contract: "Č. zmluvy",
    status: "Stav", notes: "Poznámky", active: "Aktívny", inactive: "Neaktívny", save: "Uložiť", cancel: "Zrušiť",
    weekly: "Týždenne", biweekly: "Dvojtýždenne", monthly: "Mesačne",
  },
};

export default function VendorDialog({ open, onOpenChange, form, setForm, onSave, saving, lang }) {
  const L = LABELS[lang] || LABELS.en;
  const T = useT();
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? L.edit : L.add}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>{L.name} *</Label>
            <Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="space-y-2 col-span-2 sm:col-span-1">
            <Label>{L.legal}</Label>
            <Input value={form.legal_name || ""} onChange={(e) => set("legal_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.vendorId}</Label>
            <Input
              readOnly
              disabled
              className="bg-muted text-muted-foreground"
              value={form.id ? form.vendor_id || "" : T("Assigned automatically")}
            />
          </div>
          <div className="space-y-2">
            <Label>{L.reg}</Label>
            <Input value={form.registration_number || ""} onChange={(e) => set("registration_number", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.tax}</Label>
            <Input value={form.tax_number || ""} onChange={(e) => set("tax_number", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.vat}</Label>
            <Input value={form.vat_number || ""} onChange={(e) => set("vat_number", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.country}</Label>
            <Input value={form.country || ""} onChange={(e) => set("country", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.city}</Label>
            <Input value={form.city || ""} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.postal}</Label>
            <Input value={form.postal_code || ""} onChange={(e) => set("postal_code", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.address}</Label>
            <Input value={form.address || ""} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.contact}</Label>
            <Input value={form.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.email}</Label>
            <Input value={form.email || ""} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.phone}</Label>
            <Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.currency}</Label>
            <Select value={form.default_currency || "EUR"} onValueChange={(v) => set("default_currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{L.terms}</Label>
            <Input value={form.payment_terms || ""} onChange={(e) => set("payment_terms", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.cycle}</Label>
            <Select value={form.payroll_cycle || "monthly"} onValueChange={(v) => set("payroll_cycle", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">{L.weekly}</SelectItem>
                <SelectItem value="biweekly">{L.biweekly}</SelectItem>
                <SelectItem value="monthly">{L.monthly}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{L.contract}</Label>
            <Input value={form.contract_reference || ""} onChange={(e) => set("contract_reference", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{L.status}</Label>
            <Select value={form.status || "active"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{L.active}</SelectItem>
                <SelectItem value="inactive">{L.inactive}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 col-span-2">
            <Label>{L.notes}</Label>
            <Textarea rows={2} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{L.cancel}</Button>
          <Button onClick={onSave} disabled={saving}>{L.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}