import { Camera, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { Button, Dialog } from "../ui";

/** Phones have a camera app the file picker can open; elsewhere we show the webcam ourselves. */
export const hasNativeCamera =
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches === true;

/**
 * A photo as small as a reader needs it: phone pictures are several megabytes, which is slow to
 * upload and more than a vision model takes.
 */
export async function shrinkImage(file: File, max = 2400): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1_200_000) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
    return blob && blob.size < file.size
      ? new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })
      : file;
  } catch {
    return file;
  }
}

/** Takes pictures with the device's camera: one, or several in a row (the pages of a document). */
export function CameraDialog({
  open,
  multiple,
  onClose,
  onCapture,
}: {
  open: boolean;
  multiple: boolean;
  onClose: () => void;
  onCapture: (file: File) => Promise<void> | void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [taken, setTaken] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    let stream: MediaStream | null = null;
    let stopped = false;
    setError(null);
    setTaken(0);
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
      })
      .then((s) => {
        if (stopped) {
          for (const track of s.getTracks()) {
            track.stop();
          }
          return;
        }
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
        }
      })
      .catch(() => setError(t("camera.denied")));
    if (!navigator.mediaDevices) {
      setError(t("camera.denied"));
    }
    return () => {
      stopped = true;
      for (const track of stream?.getTracks() ?? []) {
        track.stop();
      }
    };
  }, [open]);

  const shoot = async () => {
    const el = video.current;
    if (!el?.videoWidth) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    canvas.getContext("2d")?.drawImage(el, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    if (!blob) {
      return;
    }
    setBusy(true);
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      await onCapture(new File([blob], `foto-${stamp}.jpg`, { type: "image/jpeg" }));
      setTaken((n) => n + 1);
      if (!multiple) {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("camera.title")} wide>
      {error ? (
        <p className="rounded-xl bg-rose-tint px-4 py-3 text-[14px] text-rose">{error}</p>
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: a live camera picture has no captions
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full rounded-2xl bg-black object-contain"
        />
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="text-[13px] text-ink-3">
          {taken ? t("camera.taken", { n: taken }) : t("camera.hint")}
        </span>
        <div className="flex gap-2">
          {multiple && taken ? (
            <Button variant="secondary" onClick={onClose}>
              <Check className="size-4" /> {t("camera.done")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
          )}
          <Button onClick={() => void shoot()} busy={busy} disabled={Boolean(error)}>
            <Camera className="size-4" /> {t("camera.shoot")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
