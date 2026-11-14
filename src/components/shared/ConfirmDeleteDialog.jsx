import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useT } from "@/lib/translations";

export default function ConfirmDeleteDialog({ open, onClose, onConfirm, message }) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <DialogTitle>{t("Are you sure?")}</DialogTitle>
          </div>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{message || t("This action cannot be undone.")}</p>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>{t("No")}</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onClose(); }}>{t("Yes, delete")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}