// Izvoz internog obračuna u CSV / Excel / PDF (spec §9) — isti redovi i zbir kao na ekranu (billingExportData).
import { useState } from "react";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/**
 * @param {() => object} getData vraća billingExportData(...) (ili redove pregleda kad je `onExport` zadat)
 * @param {(kind: string, mod: object) => Promise|void} [onExport] prilagođen izvoz (npr. pregled po projektu)
 */
export default function BillingExport({ T, lang, getData, onExport, formats = ["excel", "csv", "pdf"], disabled, size = "sm" }) {
  const [busy, setBusy] = useState(false);
  const labels = { excel: T.exportExcel, csv: T.exportCsv, pdf: T.exportPdf };
  const run = async (kind) => {
    setBusy(true);
    try {
      const mod = await import("@/lib/billingExport");
      if (onExport) await onExport(kind, mod);
      else {
        const data = getData();
        if (kind === "csv") mod.exportBillingCsv(data, { T, lang });
        else if (kind === "pdf") await mod.exportBillingPdf(data, { T, lang });
        else mod.exportBillingExcel(data, { T, lang });
      }
      toast.success(T.exportDone);
    } catch (e) {
      console.error("[billing] export", e);
      toast.error(T.exportFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} className="gap-2" disabled={disabled || busy}>
          <Download className="w-4 h-4" />
          {T.export}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((f) => (
          <DropdownMenuItem key={f} onSelect={() => run(f)}>
            <FileText className="w-4 h-4 mr-2 text-muted-foreground" />
            {labels[f]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
