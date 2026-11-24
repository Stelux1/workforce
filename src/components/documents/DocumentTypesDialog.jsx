// Vrste dokumenata (settings.manage, model §2.10): osetljivost određuje ko sme da otvori/izveze fajl (T19),
// neaktivna vrsta se više ne nudi za nov dokument ni zahtev, ali postojeći dokumenti ostaju.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { DOCUMENT_CATEGORIES, documentCategoryLabel } from "@/lib/documentCategories";
import { safeName } from "@/lib/onboarding";

const BUILT_IN = new Set(DOCUMENT_CATEGORIES.map((c) => c.value));

export default function DocumentTypesDialog({ open, onClose, types }) {
  const L = useL();
  const { lang } = useLang();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [sensitive, setSensitive] = useState(true);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["document-types"] });

  const update = useMutation({
    mutationFn: ({ code, patch }) => base44.entities.DocumentType.update(code, patch),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: () => {
      const base = safeName(name, "").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "type";
      let code = base;
      for (let i = 2; types.some((t) => t.code === code); i += 1) code = `${base}_${i}`;
      const sort = Math.max(0, ...types.map((t) => t.sort || 0)) + 10;
      return base44.entities.DocumentType.create({ code, name: name.trim(), sensitive, sort, active: true });
    },
    onSuccess: () => {
      toast.success(L("Document type added", "Vrsta dokumenta je dodata", "Typ dokumentu bol pridaný"));
      setName("");
      setSensitive(true);
      refresh();
    },
  });

  const sorted = [...types].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.code.localeCompare(b.code));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{L("Document types", "Vrste dokumenata", "Typy dokumentov")}</DialogTitle>
          <DialogDescription>
            {L("Files of sensitive types can be opened and exported only by users with the \"sensitive documents\" permission.",
              "Fajlove osetljivih vrsta otvaraju i izvoze samo korisnici sa pravom na osetljiva dokumenta.",
              "Súbory citlivých typov môžu otvárať a exportovať len používatelia s oprávnením na citlivé dokumenty.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-4 py-2 font-medium">{L("Type", "Vrsta", "Typ")}</th>
                <th className="px-3 py-2 font-medium">{L("Sensitive", "Osetljiv", "Citlivý")}</th>
                <th className="px-3 py-2 font-medium">{L("Active", "Aktivan", "Aktívny")}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.code} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <span className={t.active ? "" : "text-muted-foreground"}>{documentCategoryLabel(t.code, lang, types)}</span>
                    {!BUILT_IN.has(t.code) && <span className="ml-2 text-xs text-muted-foreground">{t.code}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Switch checked={t.sensitive} disabled={update.isPending}
                      aria-label={`${L("Sensitive", "Osetljiv", "Citlivý")}: ${documentCategoryLabel(t.code, lang, types)}`}
                      onCheckedChange={(v) => update.mutate({ code: t.code, patch: { sensitive: v } })} />
                  </td>
                  <td className="px-3 py-2">
                    <Switch checked={t.active} disabled={update.isPending}
                      aria-label={`${L("Active", "Aktivan", "Aktívny")}: ${documentCategoryLabel(t.code, lang, types)}`}
                      onCheckedChange={(v) => update.mutate({ code: t.code, patch: { active: v } })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-3 pt-2">
          <div className="space-y-1.5 flex-1 min-w-[12rem]">
            <Label htmlFor="dt-name">{L("New type", "Nova vrsta", "Nový typ")}</Label>
            <Input id="dt-name" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={L("e.g. Welding certificate EN ISO 9606", "npr. Sertifikat za zavarivanje EN ISO 9606", "napr. Zváračský certifikát EN ISO 9606")} />
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <Switch checked={sensitive} onCheckedChange={setSensitive} /> {L("Sensitive", "Osetljiv", "Citlivý")}
          </label>
          <Button className="gap-1.5" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            <Plus className="w-4 h-4" /> {L("Add", "Dodaj", "Pridať")}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{L("Close", "Zatvori", "Zavrieť")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
