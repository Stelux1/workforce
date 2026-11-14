import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";

export default function DocumentPreviewModal({ doc, open, onClose }) {
  if (!doc) return null;

  const isImage = doc.file_url && /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(doc.file_url);
  const isPdf = doc.file_url && /\.pdf(\?|$)/i.test(doc.file_url);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            {doc.title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-auto rounded-lg border bg-muted/30">
          {!doc.file_url ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Nema priloženog fajla
            </div>
          ) : isImage ? (
            <img
              src={doc.file_url}
              alt={doc.title}
              className="w-full h-auto object-contain max-h-[70vh]"
            />
          ) : isPdf ? (
            <iframe
              src={doc.file_url}
              className="w-full"
              style={{ height: "70vh" }}
              title={doc.title}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-4 text-muted-foreground text-sm">
              <FileText className="w-12 h-12 opacity-40" />
              <p>Pregled nije dostupan za ovaj tip fajla</p>
              <p className="text-xs">{doc.file_name}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Zatvori</Button>
          {doc.file_url && (
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
              <Button className="gap-2">
                <Download className="w-4 h-4" /> Preuzmi
              </Button>
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}