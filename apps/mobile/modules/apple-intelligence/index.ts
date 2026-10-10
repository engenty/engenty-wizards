import { Platform } from "react-native";

/**
 * Apple's models on this phone (ios/AppleIntelligenceModule.swift): Apple Intelligence for short
 * text, SpeechAnalyzer for voice notes. Only an iPhone on iOS 26 has them; everywhere else the
 * module is not there and `status` says so, and the bridge offers nothing of it.
 */

export interface AppleStatus {
  /** iOS 26 or later: voice notes can be written down here. */
  supported: boolean;
  /** Apple Intelligence answers right now (switched on, model loaded). */
  available: boolean;
  reason: string | null;
}

export interface AppleCall {
  system?: string;
  prompt: string;
  schema?: unknown;
  useCase?: "general" | "tagging";
}

export interface AppleAnswer {
  text?: string;
  error?: { kind: string; message: string };
}

interface NativeModule {
  status(): Promise<AppleStatus>;
  generate(call: AppleCall): Promise<AppleAnswer>;
  transcribe(path: string, locale: string): Promise<AppleAnswer>;
}

function load(): NativeModule | null {
  if (Platform.OS !== "ios") {
    return null;
  }
  try {
    // The module's own package: part of `expo`, which the app has.
    const { requireOptionalNativeModule } = require("expo") as {
      requireOptionalNativeModule: (name: string) => NativeModule | null;
    };
    return requireOptionalNativeModule("AppleIntelligence");
  } catch {
    return null;
  }
}

const native = load();

const NONE: AppleStatus = { supported: false, available: false, reason: "device" };

export const appleIntelligence = {
  async status(): Promise<AppleStatus> {
    if (!native) {
      return NONE;
    }
    try {
      return await native.status();
    } catch {
      return NONE;
    }
  },
  /** One answer: text, or JSON matching the call's schema. */
  async generate(call: AppleCall): Promise<AppleAnswer> {
    if (!native) {
      return { error: { kind: "unavailable", message: "device" } };
    }
    return native.generate(call);
  },
  /** A recording at `path` as text, in the language of `locale` (`de-DE`). */
  async transcribe(path: string, locale: string): Promise<AppleAnswer> {
    if (!native) {
      return { error: { kind: "unavailable", message: "device" } };
    }
    return native.transcribe(path, locale);
  },
};
