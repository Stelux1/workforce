import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, Lock } from "lucide-react";
import { useL } from "@/lib/translations";
import { useLang } from "@/lib/LanguageContext";
import { formatIsoDate } from "@/lib/dateFormat";

export default function DocumentPreviewModal({ doc, open, onClose }) {
  const L = useL();
  const { lang } = useLang();
  if (!doc) return null;

  // Potpisan link nema ekstenziju na kraju putanje uvek na istom mestu — gleda se i naziv fajla.
  const name = `${doc.file_name || ""} ${doc.file_url || ""}`;
  const isImage = doc.file_url && /\.(png|jpe?g|gif|webp)(\?|\s|$)/i.test(name);
  const isPdf = doc.file_url && /\.pdf(\?|\s|$)/i.test(name);
  const dates = [
    doc.issue_date && `${L("Issued", "Izdat", "Vydaný")} ${formatIsoDate(doc.issue_date, lang)}`,
    doc.expiration_date && `${L("Expires", "Ističe", "Platný do")} ${formatIsoDate(doc.expiration_date, lang)}`,
  ].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {doc.title}
          </DialogTitle>
          {dates && <DialogDescription>{dates}</DialogDescription>}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-muted/30">
          {doc.file_unavailable ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-sm text-center px-4">
              <Lock className="w-8 h-8 opacity-50" />
              <p>{L("You don't have permission to open this file (sensitive document).",
                "Nemate pravo da otvorite ovaj fajl (osetljiv dokument).",
                "Nemáte oprávnenie otvoriť tento súbor (citlivý dokument).")}</p>
            </div>
          ) : !doc.file_url ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              {L("No file attached", "Nema priloženog fajla", "Bez priloženého súboru")}
            </div>
          ) : isImage ? (
            <img src={doc.file_url} alt={doc.title} className="w-full h-auto object-contain max-h-[70vh]" />
          ) : isPdf ? (
            <iframe src={doc.file_url} className="w-full" style={{ height: "70vh" }} title={doc.title} />
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-4 text-muted-foreground text-sm">
              <FileText className="w-12 h-12 opacity-40" />
              <p>{L("Preview is not available for this file type", "Pregled nije dostupan za ovaj tip fajla", "Náhľad nie je dostupný pre tento typ súboru")}</p>
              <p className="text-xs">{doc.file_name}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{L("Close", "Zatvori", "Zavrieť")}</Button>
          {doc.file_url && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
              <Button className="gap-2">
                <Download className="w-4 h-4" /> {L("Download", "Preuzmi", "Stiahnuť")}
              </Button>
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
