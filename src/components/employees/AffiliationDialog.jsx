import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const LABELS = {
  en: {
    add: "Add Engagement", edit: "Edit Engagement", type: "Engagement Type",
    direct: "Direct employee", subcontractor: "Subcontractor worker", vendor: "Vendor",
    start: "Effective From", end: "Effective To", status: "Status", active: "Active", ended: "Ended",
    notes: "Notes", save: "Save", cancel: "Cancel", open: "leave empty for open-ended",
  },
  rs: {
    add: "Dodaj angažovanje", edit: "Uredi angažovanje", type: "Tip angažovanja",
    direct: "Direktan zaposleni", subcontractor: "Radnik podugovarača", vendor: "Dobavljač",
    start: "Važi od", end: "Važi do", status: "Status", active: "Aktivno", ended: "Završeno",
    notes: "Napomene", save: "Sačuvaj", cancel: "Otkaži", open: "ostavite prazno za neograničeno",
  },
};

export default function AffiliationDialog({ open, onOpenChange, form, setForm, onSave, saving, vendors = [], lang }) {
  const L = LABELS[lang] || LABELS.en;
  const set = (key, value) => setForm((p) => ({ ...p, [key]: value }));
  const isSubcontractor = form.engagement_type === "subcontractor_worker";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{form.id ? L.edit : L.add}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{L.type} *</Label>
            <Select
              value={form.engagement_type || "direct_employee"}
              onValueChange={(v) => setForm((p) => ({ ...p, engagement_type: v, vendor_id: v === "direct_employee" ? "" : p.vendor_id }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="direct_employee">{L.direct}</SelectItem>
                <SelectItem value="subcontractor_worker">{L.subcontractor}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isSubcontractor && (
            <div className="space-y-2">
              <Label>{L.vendor} *</Label>
              <Select value={form.vendor_id || ""} onValueChange={(v) => set("vendor_id", v)}>
                <SelectTrigger><SelectValue placeholder={L.vendor} /></SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{L.start} *</Label>
              <Input type="date" value={form.start_date || ""} onChange={(e) => set("start_date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{L.end}</Label>
              <Input type="date" value={form.end_date || ""} onChange={(e) => set("end_date", e.target.value)} placeholder={L.open} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{L.status}</Label>
            <Select value={form.status || "active"} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{L.active}</SelectItem>
                <SelectItem value="ended">{L.ended}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
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