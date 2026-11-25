import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useT } from "@/lib/translations";

// Zoom i pomeranje profilne fotografije pre postavljanja (zahtev Luke, 25.11.2026). Bez dodatnih biblioteka:
// slika se prikazuje u kvadratu sa kružnom maskom, a izabrani deo se iscrtava u canvas 512×512 (JPEG).
const VIEW = 256;
const OUT = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default function PhotoCropDialog({ file, onCancel, onConfirm, busy = false }) {
  const T = useT();
  const [src, setSrc] = useState(null);
  const [size, setSize] = useState(null); // prirodna veličina slike
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    setSrc(url);
    setSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const scaleFor = (z) => (size ? Math.max(VIEW / size.w, VIEW / size.h) * z : 1);
  const clampOffset = (o, z) => {
    if (!size) return o;
    const s = scaleFor(z);
    const mx = Math.max(0, (size.w * s - VIEW) / 2);
    const my = Math.max(0, (size.h * s - VIEW) / 2);
    return { x: clamp(o.x, -mx, mx), y: clamp(o.y, -my, my) };
  };
  const applyZoom = (z) => {
    const next = clamp(Number(z.toFixed(2)), MIN_ZOOM, MAX_ZOOM);
    setZoom(next);
    setOffset((o) => clampOffset(o, next));
  };

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: offset };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    const { x, y, start } = drag.current;
    setOffset(clampOffset({ x: start.x + e.clientX - x, y: start.y + e.clientY - y }, zoom));
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e) => applyZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));

  const confirm = async () => {
    const img = imgRef.current;
    if (!img || !size) return;
    const s = scaleFor(zoom);
    const r = OUT / VIEW;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // providne PNG ivice ne postaju crne u JPEG-u
    ctx.fillRect(0, 0, OUT, OUT);
    const dw = size.w * s;
    const dh = size.h * s;
    ctx.drawImage(img, ((VIEW - dw) / 2 + offset.x) * r, ((VIEW - dh) / 2 + offset.y) * r, dw * r, dh * r);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return;
    const base = String(file?.name || "photo").replace(/\.[^.]+$/, "");
    onConfirm(new File([blob], `${base}.jpg`, { type: "image/jpeg" }));
  };

  const s = scaleFor(zoom);
  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open && !busy) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{T("Adjust Photo")}</DialogTitle>
          <DialogDescription>{T("Drag to move the photo, use the slider or mouse wheel to zoom.")}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center">
          <div
            className="relative overflow-hidden rounded-lg bg-muted touch-none select-none cursor-grab active:cursor-grabbing"
            style={{ width: VIEW, height: VIEW }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {src && (
              <img
                ref={imgRef}
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="absolute max-w-none pointer-events-none"
                style={size ? {
                  width: size.w * s,
                  height: size.h * s,
                  left: (VIEW - size.w * s) / 2 + offset.x,
                  top: (VIEW - size.h * s) / 2 + offset.y,
                } : { opacity: 0 }}
              />
            )}
            {/* kružna maska: tamni ugao van kruga koji će biti profilna slika */}
            <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)" }} />
            <div className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/80" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="icon" aria-label={T("Zoom out")} onClick={() => applyZoom(zoom - 0.25)} disabled={zoom <= MIN_ZOOM}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Slider
            value={[zoom]}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            onValueChange={([z]) => applyZoom(z)}
            aria-label={T("Zoom")}
            className="flex-1"
          />
          <Button type="button" variant="ghost" size="icon" aria-label={T("Zoom in")} onClick={() => applyZoom(zoom + 0.25)} disabled={zoom >= MAX_ZOOM}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={T("Reset")} onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{T("Cancel")}</Button>
          <Button type="button" onClick={confirm} disabled={busy || !size}>
            {busy ? T("Uploading...") : T("Use Photo")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
