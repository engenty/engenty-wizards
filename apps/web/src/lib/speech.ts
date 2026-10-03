import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { lang } from "./i18n";

interface RecognitionResult {
  readonly isFinal: boolean;
  [index: number]: { readonly transcript: string };
}

interface RecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}

interface Recognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((ev: Event & { error: string }) => void) | null;
  onresult: ((ev: RecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionConstructor = new () => Recognition;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

/** Some shells have the browser's recognition but no service behind it; then the server listens. */
let recognitionBroken = false;

function recognition(): RecognitionConstructor | undefined {
  if (typeof window === "undefined" || recognitionBroken) {
    return undefined;
  }
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

const canRecord =
  typeof navigator !== "undefined" &&
  Boolean(navigator.mediaDevices?.getUserMedia) &&
  typeof MediaRecorder !== "undefined";

function join(before: string, spoken: string): string {
  const base = before.trimEnd();
  const next = spoken.trim();
  return base && next ? `${base} ${next}` : base || next;
}

/**
 * Speaking into a draft. The browser writes along where it can recognise speech; elsewhere the
 * recording is written down on the server once the person stops.
 */
export function useDictation(draft: string, onDraft: (value: string) => void) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  const active = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => active.current?.stop(), []);

  const record = async () => {
    const before = draftRef.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("denied");
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      active.current = null;
      setListening(false);
      const mime = (recorder.mimeType || "audio/webm").split(";")[0];
      const file = new File(chunks, "dictation", { type: mime });
      if (!file.size) {
        return;
      }
      setProcessing(true);
      try {
        const { text } = await api.upload<{ text: string }>("/api/studio/transcribe", file);
        if (text.trim()) {
          onDraftRef.current(join(before, text));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setProcessing(false);
      }
    };
    active.current = { stop: () => recorder.state !== "inactive" && recorder.stop() };
    recorder.start();
    setListening(true);
  };

  const recognise = (Recognition: RecognitionConstructor) => {
    const before = draftRef.current;
    let committed = "";
    const rec = new Recognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang === "de" ? "de-DE" : "en-US";
    rec.onresult = (event) => {
      // Results below resultIndex were committed by an earlier event.
      let interim = "";
      for (let i = Math.max(0, event.resultIndex); i < event.results.length; i++) {
        const result = event.results[i];
        const said = result[0]?.transcript ?? "";
        if (result.isFinal) {
          committed = join(committed, said);
        } else {
          interim += said;
        }
      }
      onDraftRef.current(join(before, join(committed, interim)));
    };
    rec.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") {
        return;
      }
      if (event.error === "not-allowed") {
        setError("denied");
        return;
      }
      // No recognition service behind the API: from now on the recording goes to the server.
      recognitionBroken = true;
      if (canRecord && !committed) {
        rec.onend = null;
        active.current = null;
        void record();
      } else {
        setError(event.error);
      }
    };
    rec.onend = () => {
      active.current = null;
      setListening(false);
    };
    active.current = { stop: () => rec.stop() };
    rec.start();
    setListening(true);
  };

  const toggle = () => {
    if (processing) {
      return;
    }
    if (active.current) {
      active.current.stop();
      return;
    }
    setError(null);
    const Recognition = recognition();
    if (Recognition) {
      recognise(Recognition);
    } else {
      void record();
    }
  };

  return { supported: Boolean(recognition()) || canRecord, listening, processing, error, toggle };
}
