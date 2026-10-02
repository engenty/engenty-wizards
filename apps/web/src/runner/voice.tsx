import { type AudioValue, isAudioValue } from "@engenty-wizards/shared/definition";
import { FileAudio, Mic, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { Button, Spinner } from "../ui";
import { stamp } from "./camera";
import { canUseMedia } from "./device";

const MAX_SECONDS = 300;

function recordingType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find(
    (type) => MediaRecorder.isTypeSupported(type),
  );
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/**
 * A voice note: recorded here with the microphone, or — where the browser cannot record — an
 * audio file from the phone's recorder. The recording is kept as an upload; what is said in it
 * is written down on the server before the next step reads it.
 */
export function VoiceField({
  value,
  runId,
  onChange,
  onBusy,
}: {
  value: unknown;
  runId: string;
  onChange: (v: AudioValue | undefined) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const note = isAudioValue(value) ? value : null;
  const [seconds, setSeconds] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  // What was just recorded plays from memory; a note from an earlier visit plays from the server.
  const [local, setLocal] = useState<{ asset: string; url: string } | null>(null);
  const session = useRef<{ recorder: MediaRecorder; stop: () => void } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const type = recordingType();
  const canRecord = canUseMedia && Boolean(type);

  useEffect(
    () => () => {
      // Leaving the page mid-recording keeps nothing and frees the microphone.
      if (session.current) {
        session.current.recorder.onstop = null;
        session.current.stop();
      }
    },
    [],
  );
  useEffect(
    () => () => {
      if (local) {
        URL.revokeObjectURL(local.url);
      }
    },
    [local],
  );

  const keep = async (file: File, length: number | undefined) => {
    setUploading(true);
    onBusy?.(true);
    setError(null);
    try {
      const ref = await api.upload<{ id: string }>(`/api/runs/${runId}/uploads`, file);
      setLocal({ asset: ref.id, url: URL.createObjectURL(file) });
      onChange({ asset: ref.id, ...(length !== undefined ? { seconds: length } : {}) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      onBusy?.(false);
    }
  };

  const start = async () => {
    setError(null);
    setDenied(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setDenied(true);
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 48_000 });
    const began = Date.now();
    // The level bar shows the microphone hears something.
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const meter = () => {
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const s of samples) {
        peak = Math.max(peak, Math.abs(s - 128));
      }
      setLevel(Math.min(1, peak / 64));
      setSeconds((Date.now() - began) / 1000);
      if ((Date.now() - began) / 1000 >= MAX_SECONDS) {
        stop();
        return;
      }
      frame = requestAnimationFrame(meter);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      for (const track of stream.getTracks()) {
        track.stop();
      }
      void ctx.close().catch(() => undefined);
      session.current = null;
      setSeconds(null);
      setLevel(0);
    };
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const mime = (recorder.mimeType || type || "audio/webm").split(";")[0];
      const ext = mime === "audio/mp4" ? "m4a" : mime === "audio/ogg" ? "ogg" : "webm";
      const length = Math.max(1, Math.round((Date.now() - began) / 1000));
      void keep(new File(chunks, `sprachnotiz-${stamp()}.${ext}`, { type: mime }), length);
    };
    session.current = { recorder, stop };
    onBusy?.(true);
    recorder.start(1000);
    frame = requestAnimationFrame(meter);
  };

  const recording = seconds !== null;
  const fileButton = (
    <Button variant="secondary" onClick={() => picker.current?.click()}>
      <FileAudio className="size-4" /> {t("voice.pick")}
    </Button>
  );

  return (
    <div>
      {recording ? (
        <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-ember">
          <span className="relative flex size-11 shrink-0 items-center justify-center">
            <span
              className="absolute inset-0 rounded-full bg-rose-tint transition-transform duration-75"
              style={{ transform: `scale(${0.7 + level * 0.5})` }}
            />
            <span className="relative size-3.5 animate-pulse-dot rounded-full bg-rose" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[15px] tabular-nums">{clock(seconds)}</div>
            <div className="text-[13px] text-ink-3">
              {seconds > MAX_SECONDS - 30
                ? t("voice.left", { s: Math.ceil(MAX_SECONDS - seconds) })
                : t("voice.recording")}
            </div>
          </div>
          <Button onClick={() => session.current?.stop()}>
            <Square className="size-3.5 fill-current" /> {t("voice.stop")}
          </Button>
        </div>
      ) : uploading ? (
        <div className="flex items-center gap-3 rounded-xl bg-card p-4 text-[14px] text-ink-3 ring-1 ring-input">
          <Spinner className="size-4" /> {t("run.uploading")}
        </div>
      ) : note ? (
        <div className="rounded-xl bg-card p-3 ring-1 ring-input">
          {/* biome-ignore lint/a11y/useMediaCaption: the person's own voice note, just recorded */}
          <audio
            controls
            preload="metadata"
            src={
              local?.asset === note.asset ? local.url : `/api/runs/${runId}/assets/${note.asset}`
            }
            className="h-11 w-full"
          />
          {note.transcript ? (
            <p className="mt-2 whitespace-pre-wrap px-1 text-[14px] text-ink-2 leading-relaxed">
              {note.transcript}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="px-1 text-[13px] text-ink-3">
              {note.seconds ? clock(note.seconds) : null}
            </span>
            <div className="flex gap-1">
              {canRecord ? (
                <Button variant="ghost" size="sm" onClick={() => void start()}>
                  <RotateCcw className="size-3.5" /> {t("voice.again")}
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
                {t("voice.remove")}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap gap-2">
            {canRecord ? (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => void start()}
                className="w-full sm:w-auto"
              >
                <Mic className="size-4" /> {t("voice.start")}
              </Button>
            ) : (
              fileButton
            )}
            {canRecord && denied ? fileButton : null}
          </div>
          {denied ? (
            <p className="mt-2 rounded-lg bg-amber-tint px-3 py-2 text-[13px] text-ink-2 leading-relaxed">
              {t("voice.denied")}
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-ink-3 leading-relaxed">
              {t(canRecord ? "voice.why" : "voice.noRecorder")}
            </p>
          )}
        </div>
      )}
      <input
        ref={picker}
        type="file"
        hidden
        accept="audio/*"
        capture
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) {
            void keep(file, undefined);
          }
        }}
      />
      {error ? <div className="mt-2 text-[13px] text-rose">{error}</div> : null}
    </div>
  );
}
