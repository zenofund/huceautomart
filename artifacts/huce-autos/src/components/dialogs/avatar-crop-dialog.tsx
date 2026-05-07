import { useEffect, useMemo, useRef, useState } from "react";
import { AppDialog } from "@/components/app-dialog";

interface AvatarCropDialogProps {
  open: boolean;
  file: File | null;
  onClose: () => void;
  onConfirm: (croppedFile: File) => Promise<void> | void;
}

const OUTPUT_SIZE = 512;

type Rect = { x: number; y: number; w: number; h: number };

export function AvatarCropDialog({
  open,
  file,
  onClose,
  onConfirm,
}: AvatarCropDialogProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [cropSizePct, setCropSizePct] = useState(60);
  const [cropX, setCropX] = useState(0.5);
  const [cropY, setCropY] = useState(0.5);
  const [processing, setProcessing] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [displayRect, setDisplayRect] = useState<Rect | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [dragState, setDragState] = useState<{
    startPointerX: number;
    startPointerY: number;
    startCropX: number;
    startCropY: number;
  } | null>(null);

  const previewUrl = useMemo(() => {
    if (!file) return "";
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!open) return;
    setCropSizePct(60);
    setCropX(0.5);
    setCropY(0.5);
    setProcessing(false);
    setImgEl(null);
    setNaturalSize(null);
    setDisplayRect(null);
    setDragState(null);
  }, [open, file]);

  useEffect(() => {
    if (!open || !naturalSize || !frameRef.current) return;
    const frame = frameRef.current;
    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    if (!frameW || !frameH) return;

    const scale = Math.min(frameW / naturalSize.w, frameH / naturalSize.h);
    const renderedW = naturalSize.w * scale;
    const renderedH = naturalSize.h * scale;
    const x = (frameW - renderedW) / 2;
    const y = (frameH - renderedH) / 2;
    setDisplayRect({ x, y, w: renderedW, h: renderedH });
  }, [open, naturalSize]);

  useEffect(() => {
    if (!open || !naturalSize || !frameRef.current) return;
    const frame = frameRef.current;
    const observer = new ResizeObserver(() => {
      const frameW = frame.clientWidth;
      const frameH = frame.clientHeight;
      if (!frameW || !frameH) return;
      const scale = Math.min(frameW / naturalSize.w, frameH / naturalSize.h);
      const renderedW = naturalSize.w * scale;
      const renderedH = naturalSize.h * scale;
      const x = (frameW - renderedW) / 2;
      const y = (frameH - renderedH) / 2;
      setDisplayRect({ x, y, w: renderedW, h: renderedH });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [open, naturalSize]);

  useEffect(() => {
    if (!displayRect) return;
    const cropPx = Math.min(displayRect.w, displayRect.h) * (cropSizePct / 100);
    const maxX = Math.max(1, displayRect.w - cropPx);
    const maxY = Math.max(1, displayRect.h - cropPx);
    setCropX((v) => Math.min(1, Math.max(0, v)));
    setCropY((v) => Math.min(1, Math.max(0, v)));
    if (maxX <= 1) setCropX(0);
    if (maxY <= 1) setCropY(0);
  }, [cropSizePct, displayRect]);

  useEffect(() => {
    if (!dragState || !displayRect) return;
    const cropPx = Math.min(displayRect.w, displayRect.h) * (cropSizePct / 100);
    const maxX = Math.max(1, displayRect.w - cropPx);
    const maxY = Math.max(1, displayRect.h - cropPx);
    const onMove = (ev: PointerEvent) => {
      const nx = dragState.startCropX + (ev.clientX - dragState.startPointerX) / maxX;
      const ny = dragState.startCropY + (ev.clientY - dragState.startPointerY) / maxY;
      setCropX(Math.min(1, Math.max(0, nx)));
      setCropY(Math.min(1, Math.max(0, ny)));
    };
    const onUp = () => setDragState(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragState, displayRect, cropSizePct]);

  async function handleConfirm() {
    if (!imgEl || !file || !displayRect || !naturalSize) return;
    setProcessing(true);
    try {
      const cropPx = Math.min(displayRect.w, displayRect.h) * (cropSizePct / 100);
      const maxX = Math.max(0, displayRect.w - cropPx);
      const maxY = Math.max(0, displayRect.h - cropPx);
      const leftPx = displayRect.x + cropX * maxX;
      const topPx = displayRect.y + cropY * maxY;

      const localLeft = leftPx - displayRect.x;
      const localTop = topPx - displayRect.y;
      const sx = Math.max(
        0,
        Math.min(naturalSize.w - 1, (localLeft / displayRect.w) * naturalSize.w),
      );
      const sy = Math.max(
        0,
        Math.min(naturalSize.h - 1, (localTop / displayRect.h) * naturalSize.h),
      );
      const sSizeFromW = (cropPx / displayRect.w) * naturalSize.w;
      const sSizeFromH = (cropPx / displayRect.h) * naturalSize.h;
      const sSize = Math.max(1, Math.min(sSizeFromW, sSizeFromH));
      const safeSx = Math.min(sx, Math.max(0, naturalSize.w - sSize));
      const safeSy = Math.min(sy, Math.max(0, naturalSize.h - sSize));

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not open image editor");
      ctx.drawImage(
        imgEl,
        safeSx,
        safeSy,
        sSize,
        sSize,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Could not crop image"))),
          "image/jpeg",
          0.92,
        );
      });
      const stem = file.name.replace(/\.[^.]+$/, "") || "avatar";
      const cropped = new File([blob], `${stem}-avatar.jpg`, { type: "image/jpeg" });
      await onConfirm(cropped);
    } finally {
      setProcessing(false);
    }
  }

  if (!open) return null;

  return (
    <AppDialog
      open={open}
      onClose={processing ? () => null : onClose}
      title="Crop Avatar"
      subtitle="Select the exact 1:1 area to use as your avatar."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            onClick={onClose}
            disabled={processing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
            onClick={handleConfirm}
            disabled={!imgEl || processing}
          >
            {processing ? "Saving..." : "Use This Crop"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div
          ref={frameRef}
          className="relative mx-auto w-full max-w-[320px] aspect-square overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
        >
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Avatar crop preview"
              className="absolute inset-0 h-full w-full object-contain"
              onLoad={(e) => {
                const target = e.currentTarget;
                setImgEl(target);
                setNaturalSize({
                  w: target.naturalWidth,
                  h: target.naturalHeight,
                });
              }}
            />
          )}
          {displayRect && (
            <>
              {(() => {
                const cropPx = Math.min(displayRect.w, displayRect.h) * (cropSizePct / 100);
                const maxX = Math.max(0, displayRect.w - cropPx);
                const maxY = Math.max(0, displayRect.h - cropPx);
                const left = displayRect.x + cropX * maxX;
                const top = displayRect.y + cropY * maxY;
                return (
                  <>
                    <div
                      className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                      style={{
                        left,
                        top,
                        width: cropPx,
                        height: cropPx,
                      }}
                    />
                    <button
                      type="button"
                      className="absolute cursor-grab active:cursor-grabbing border-2 border-primary/80 bg-transparent"
                      style={{
                        left,
                        top,
                        width: cropPx,
                        height: cropPx,
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setDragState({
                          startPointerX: e.clientX,
                          startPointerY: e.clientY,
                          startCropX: cropX,
                          startCropY: cropY,
                        });
                      }}
                      aria-label="Move crop area"
                    />
                  </>
                );
              })()}
            </>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Crop Size (1:1)</label>
          <input
            type="range"
            min={25}
            max={95}
            step={1}
            value={cropSizePct}
            onChange={(e) => setCropSizePct(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <p className="text-xs text-gray-500">
          Drag the square to choose the visible area. Output ratio is always 1:1.
        </p>
      </div>
    </AppDialog>
  );
}
