import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Save, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/shared/PageHeader";
import { useL } from "@/lib/translations";
import { useUnsavedUpload } from "@/lib/useUnsavedUpload";
import { COMPANY_FIELDS, LOGO_MAX_BYTES, companyErrors, companyIsEmpty, logoProblem, normalizeCompany } from "@/lib/companyDetails";

const toText = (v) => (v === null || v === undefined ? "" : String(v));

function CompanyForm({ row, L }) {
  const queryClient = useQueryClient();
  const fileInput = useRef(null);
  const [form, setForm] = useState({});
  const [logo, setLogo] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const f = {};
    COMPANY_FIELDS.forEach((k) => { f[k] = toText(row?.[k]); });
    setForm(f);
    setLogo(row?.logo_url || null);
  }, [row]);

  const save = useMutation({
    mutationFn: () => base44.entities.CompanySettings.update(true, { ...normalizeCompany(form), logo_url: logo }),
    onSuccess: () => {
      upload.commit();
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success(L("Company details saved", "Podaci firme su sačuvani"));
    },
  });
  const upload = useUnsavedUpload(save.isPending);

  const errors = companyErrors(form);
  const hasErrors = Object.keys(errors).length > 0;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const problem = await logoProblem(file);
    if (problem === "tooBig") return toast.error(L("The logo is too large (max 2 MB).", "Logotip je prevelik (najviše 2 MB)."));
    if (problem) return toast.error(L("The logo must be a PNG or JPG image.", "Logotip mora biti PNG ili JPG slika."));
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file, maxBytes: LOGO_MAX_BYTES });
      upload.track(file_url); // prethodni nesačuvan logotip se briše
      setLogo(file_url);
    } catch (err) {
      toast.error(err?.message || L("Upload failed", "Otpremanje nije uspelo"));
    } finally {
      setUploading(false);
    }
  };

  const removeLogo = () => {
    upload.discard(); // nesačuvan test/novi logotip se briše; sačuvan se briše tek pri čuvanju
    setLogo(null);
  };

  const cancel = () => {
    upload.discard();
    const f = {};
    COMPANY_FIELDS.forEach((k) => { f[k] = toText(row?.[k]); });
    setForm(f);
    setLogo(row?.logo_url || null);
  };

  const field = (key, label, props = {}) => (
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={`company-${key}`}>{label}</Label>
      <Input
        id={`company-${key}`} data-testid={`company-${key}`}
        value={form[key] ?? ""}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={Boolean(errors[key])}
        className={errors[key] ? "border-red-500 bg-red-50 text-red-700 focus-visible:ring-red-500" : ""}
        {...props}
      />
      {errors[key] && (
        <p className="text-xs text-red-600" data-testid={`company-${key}-error`}>
          {key === "pib"
            ? L("PIB must have exactly 9 digits.", "PIB mora imati tačno 9 cifara.")
            : L("Registration number must have exactly 8 digits.", "Matični broj mora imati tačno 8 cifara.")}
        </p>
      )}
    </div>
  );

  const emptyNow = companyIsEmpty({ ...form, logo_url: logo });

  return (
    <div className="space-y-6">
      {emptyNow && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" data-testid="company-empty-note">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>
            {L(
              "Company details are not entered yet. Payslip and timesheet PDFs will show no company header until they are filled in.",
              "Podaci firme još nisu uneti. PDF platnog lista i satnice neće imati zaglavlje firme dok se ne popune."
            )}
          </p>
        </div>
      )}

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold text-base">{L("Company", "Firma")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", L("Company name", "Naziv firme"), { autoComplete: "off" })}
          {field("pib", L("PIB (tax ID)", "PIB"), { inputMode: "numeric", maxLength: 9 })}
          {field("registration_number", L("Registration number", "Matični broj"), { inputMode: "numeric", maxLength: 8 })}
          {field("bank_account", L("Bank account", "Tekući račun"), { autoComplete: "off" })}
          {field("address", L("Address", "Adresa"))}
          {field("city", L("City", "Mesto"))}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-base">{L("Logo", "Logotip")}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {L("PNG or JPG, up to 2 MB. Shown in the header of PDF documents.", "PNG ili JPG, do 2 MB. Prikazuje se u zaglavlju PDF dokumenata.")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {logo ? (
            <img src={logo} alt={L("Company logo", "Logotip firme")} className="h-20 max-w-[16rem] object-contain rounded border bg-white p-1" data-testid="company-logo-preview" />
          ) : (
            <div className="h-20 w-40 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">
              {L("No logo", "Nema logotipa")}
            </div>
          )}
          <div className="flex gap-2">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFile} data-testid="company-logo-input" />
            <Button type="button" variant="outline" className="gap-2" disabled={uploading || save.isPending} onClick={() => fileInput.current?.click()}>
              <Upload className="w-4 h-4" />
              {logo ? L("Replace logo", "Zameni logotip") : L("Upload logo", "Otpremi logotip")}
            </Button>
            {logo && (
              <Button type="button" variant="ghost" className="gap-2 text-destructive hover:text-destructive" disabled={uploading || save.isPending} onClick={removeLogo}>
                <Trash2 className="w-4 h-4" />
                {L("Remove", "Ukloni")}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={cancel} disabled={save.isPending}>{L("Cancel", "Otkaži")}</Button>
        <Button onClick={() => save.mutate()} disabled={hasErrors || uploading || save.isPending} className="gap-2" data-testid="company-save">
          <Save className="w-4 h-4" />
          {L("Save", "Sačuvaj")}
        </Button>
      </div>
    </div>
  );
}

export default function CompanySettings() {
  const L = useL();
  const { data, isLoading } = useQuery({ queryKey: ["company-settings"], queryFn: () => base44.entities.CompanySettings.list(null, 1) });

  return (
    <div className="space-y-6">
      <PageHeader
        title={L("Company Details", "Podaci firme")}
        subtitle={L(
          "Company name, tax numbers, address, bank account and logo used on PDF documents",
          "Naziv, brojevi, adresa, tekući račun i logotip firme koji se koriste na PDF dokumentima"
        )}
      />
      {isLoading ? <Skeleton className="h-64 rounded-xl" /> : <CompanyForm row={(data || [])[0]} L={L} />}
    </div>
  );
}
