import { defaultFeatures, type FeatureName } from "@engenty-wizards/shared/features";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { useMe } from "./session";

/**
 * Which feature switches are on (packages/shared/src/features.ts). Signed in, `/api/studio/me`
 * brings them resolved for the team or the linked account; before that `/api/config` brings
 * what the runtime knows alone. Until either answered, the code's defaults count.
 */
export interface Config {
  mode: "managed" | "local";
  devLogin: boolean;
  site: string | null;
  signedOutUrl: string | null;
  features: Record<string, boolean>;
}

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<Config>("/api/config"),
    staleTime: 60_000,
  });
}

export function useFeatures(): Record<string, boolean> {
  const me = useMe();
  const config = useConfig();
  return me.data?.features ?? config.data?.features ?? defaultFeatures();
}

/** A plugin's own switch is asked for by its full name: `contacts.leadScoring`. */
export function useFeature(name: FeatureName | (string & {})): boolean {
  return useFeatures()[name] === true;
}
