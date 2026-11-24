// Forma troška (C1/C2): Add i Edit, ista u oba pogleda. Pravila kao baza (guard_project_cost): obavezni projekat, datum,
// iznos, valuta, kategorija; potkategorija kad je kategorija ima; ne-EUR traži kurs i datum kursa; radnik ILI dobavljač.
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Paperclip, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCIES } from "@/lib/finance/currency";
import { useUnsavedUpload } from "@/lib/useUnsavedUpload";
import { buildCostPayload, categoryHasSubcategories, possibleDuplicate, subcategoryNames, validateCostForm } from "@/lib/projectCosts";
import { rsdToEur, validExchangeRate } from "@/lib/payroll/costs";
import { costProjectLabel, invalidateCosts, workerName } from "./costsShared";

const today = () => format(new Date(), "yyyy-MM-dd");

const emptyForm = (projectId) => ({
  project_id: projectId || "", cost_date: today(), amount: "", currency: "EUR", eur_rsd_rate: "", fx_rate_date: "",
  cost_category_id: "", subcategory: "", party: "none", employee_id: "", vendor_id: "", billable: false,
  description: "", notes: "",
});

const fromCost = (c) => ({
  project_id: c.project_id, cost_date: String(c.cost_date || "").slice(0, 10), amount: String(c.amount ?? ""),
  currency: c.currency || "EUR", eur_rsd_rate: c.eur_rsd_rate === null || c.eur_rsd_rate === undefined ? "" : String(Number(c.eur_rsd_rate)),
  fx_rate_date: String(c.fx_rate_date || "").slice(0, 10), cost_category_id: c.cost_category_id || "", subcategory: c.subcategory || "",
  party: c.employee_id ? "employee" : c.vendor_id ? "vendor" : "none", employee_id: c.employee_id || "", vendor_id: c.vendor_id || "",
  billable: !!c.billable, description: c.description || "", notes: c.notes || "",
});

function Field({ label, error, children, hint, required }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}{required && " *"}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export default function CostFormDialog({ open, onOpenChange, cost, lockedProjectId, lookup, existingCosts, T, lang }) {
  const queryClient = useQueryClient();
  const editing = !!cost;
  const [form, setForm] = useState(() => emptyForm(lockedProjectId));
  const [submitted, setSubmitted] = useState(false);
  const [receipt, setReceipt] = useState(null); // { url, name } novo otpremljen | { removed: true } | null = bez izmene
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const [saving, setSaving] = useState(false);
  const { track, discard, commit } = useUnsavedUpload(saving);

  // Svako otvaranje počinje iz početnog stanja (Add) ili iz izabranog troška (Edit).
  useEffect(() => {
    if (!open) return;
    setForm(cost ? fromCost(cost) : emptyForm(lockedProjectId));
    setSubmitted(false);
    setReceipt(null);
  }, [open, cost, lockedProjectId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const categories = lookup.categories;
  const category = categories.find((c) => c.id === form.cost_category_id) || null;
  const subs = category ? subcategoryNames(category) : [];
  const errors = useMemo(() => validateCostForm(form, { categories }), [form, categories]);
  const errText = (field) => {
    if (!submitted || !errors[field]) return null;
    const code = errors[field];
    if (code === "required" && (field === "eur_rsd_rate" || field === "fx_rate_date")) return T.rateRequired;
    if (code === "payroll_linked") return T.payrollLinkedError;
    if (code === "one_party") return T.onePartyError;
    return code === "negative" ? T.negative : code === "unknown" ? T.unknown : T.required;
  };

  const duplicates = useMemo(
    () => possibleDuplicate({ id: cost?.id, project_id: form.project_id, cost_date: form.cost_date, amount: form.amount.replace(",", "."), currency: form.currency }, existingCosts),
    [cost?.id, form.project_id, form.cost_date, form.amount, form.currency, existingCosts]
  );
  const eurPreview = form.currency !== "EUR" && form.amount && validExchangeRate(form.eur_rsd_rate) && form.fx_rate_date
    ? rsdToEur(form.amount.replace(",", "."), form.eur_rsd_rate) : null;

  const save = useMutation({
    onMutate: () => setSaving(true),
    onSettled: () => setSaving(false),
    mutationFn: async () => {
      const data = buildCostPayload(form);
      if (receipt?.removed) Object.assign(data, { receipt_url: null, receipt_name: null });
      else if (receipt?.url) Object.assign(data, { receipt_url: receipt.url, receipt_name: receipt.name });
      return editing ? base44.entities.ProjectCost.update(cost.id, data) : base44.entities.ProjectCost.create(data);
    },
    onSuccess: () => {
      commit();
      invalidateCosts(queryClient); // kartica projekta, centralna tabela, finansijski izveštaj
      toast.success(editing ? T.saved : T.added);
      onOpenChange(false);
    },
  });

  const onSubmit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length) return;
    save.mutate();
  };

  const close = (next) => {
    if (!next) discard(); // nesačuvan prilog se briše iz skladišta
    onOpenChange(next);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      track(res.file_url);
      setReceipt({ url: res.file_url, name: file.name });
    } finally {
      setUploading(false);
    }
  };

  const currentReceiptName = receipt?.removed ? null : receipt?.name || cost?.receipt_name || null;
  const legacy = editing && !cost.cost_category_id;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? T.edit : T.add}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {legacy && (
            <div className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
              <span>{T.legacyCategory}{cost.category ? ` (${cost.category})` : ""}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={T.project} required error={errText("project_id")}>
              <Select value={form.project_id || undefined} onValueChange={(v) => set({ project_id: v })} disabled={!!lockedProjectId}>
                <SelectTrigger><SelectValue placeholder={T.pickProject} /></SelectTrigger>
                <SelectContent>
                  {lookup.projects.map((p) => <SelectItem key={p.id} value={p.id}>{costProjectLabel(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={T.date} required error={errText("cost_date")}>
              <Input type="date" value={form.cost_date} onChange={(e) => set({ cost_date: e.target.value })} />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={T.amount} required error={errText("amount")}>
              <Input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
            </Field>
            <Field label={T.currency} required error={errText("currency")}>
              <Select value={form.currency} onValueChange={(v) => set({ currency: v, ...(v !== "EUR" && !form.fx_rate_date ? { fx_rate_date: form.cost_date } : {}) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          {form.currency !== "EUR" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-3">
              <Field label={T.rateFor(form.currency)} required error={errText("eur_rsd_rate")} hint={T.rateHint(form.currency)}>
                <Input type="number" inputMode="decimal" step="0.0001" min="0" value={form.eur_rsd_rate} onChange={(e) => set({ eur_rsd_rate: e.target.value })} />
              </Field>
              <Field label={T.rateDate} required error={errText("fx_rate_date")}>
                <Input type="date" value={form.fx_rate_date} onChange={(e) => set({ fx_rate_date: e.target.value })} />
              </Field>
              {eurPreview !== null && <p className="sm:col-span-2 text-xs text-muted-foreground tabular-nums">{T.ratePreview(eurPreview.toFixed(2))}</p>}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={T.category} required error={errText("cost_category_id")}>
              <Select value={form.cost_category_id || undefined} onValueChange={(v) => set({ cost_category_id: v, subcategory: "" })}>
                <SelectTrigger><SelectValue placeholder={T.pickCategory} /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} disabled={c.payroll_linked}>
                      {c.name}{c.payroll_linked ? ` (${T.payrollLinked})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {category && categoryHasSubcategories(category) && (
              <Field label={T.subcategory} required error={errText("subcategory")}>
                <Select value={form.subcategory || undefined} onValueChange={(v) => set({ subcategory: v })}>
                  <SelectTrigger><SelectValue placeholder={T.pickSubcategory} /></SelectTrigger>
                  <SelectContent>{subs.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </div>
          {categories.some((c) => c.payroll_linked) && <p className="text-xs text-muted-foreground -mt-2">{T.payrollHelp}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={T.linkedTo} error={errText("employee_id")}>
              <Select value={form.party} onValueChange={(v) => set({ party: v, employee_id: "", vendor_id: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{T.none}</SelectItem>
                  <SelectItem value="employee">{T.worker}</SelectItem>
                  <SelectItem value="vendor">{T.vendor}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.party === "employee" && (
              <Field label={T.worker}>
                <Select value={form.employee_id || undefined} onValueChange={(v) => set({ employee_id: v })}>
                  <SelectTrigger><SelectValue placeholder={T.pick} /></SelectTrigger>
                  <SelectContent>{lookup.employees.map((e) => <SelectItem key={e.id} value={e.id}>{workerName(e)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
            {form.party === "vendor" && (
              <Field label={T.vendor}>
                <Select value={form.vendor_id || undefined} onValueChange={(v) => set({ vendor_id: v })}>
                  <SelectTrigger><SelectValue placeholder={T.pick} /></SelectTrigger>
                  <SelectContent>{lookup.vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <Field label={T.description}>
            <Input value={form.description} placeholder={T.descriptionPlaceholder} onChange={(e) => set({ description: e.target.value })} maxLength={200} />
          </Field>
          <Field label={T.notes}>
            <Textarea rows={2} value={form.notes} placeholder={T.notesPlaceholder} onChange={(e) => set({ notes: e.target.value })} />
          </Field>

          <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
            <Checkbox checked={form.billable} onCheckedChange={(v) => set({ billable: v === true })} className="mt-0.5" />
            <span>
              <span className="text-sm font-medium">{T.billable}</span>
              <span className="block text-xs text-muted-foreground">{T.billableHint}</span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label>{T.receipt}</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={fileRef} type="file" className="hidden" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={onFile} />
              <Button type="button" variant="outline" size="sm" className="gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? T.receiptUploading : currentReceiptName ? T.receiptReplace : T.receiptChoose}
              </Button>
              {currentReceiptName && (
                <span className="inline-flex items-center gap-1 text-sm">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />{currentReceiptName}
                  <button type="button" className="ml-1 text-muted-foreground hover:text-destructive" aria-label={T.receiptRemove}
                    onClick={() => { discard(); setReceipt({ removed: true }); }}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{T.receiptHint}</p>
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs flex items-start gap-2" role="status">
              <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
              <span>{T.possibleDuplicate}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>{T.cancel}</Button>
          <Button onClick={onSubmit} disabled={save.isPending || uploading}>
            {save.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {T.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
