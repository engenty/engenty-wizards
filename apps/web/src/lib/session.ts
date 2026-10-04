import type { ModelClass, WizardDefinition } from "@engenty-wizards/shared/definition";
import type { BrandColor, ProjectFact } from "@engenty-wizards/shared/projects";
import type { WorkspaceFile } from "@engenty-wizards/shared/workspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { ApiError, api } from "./api";
import { STUDIO, withBase } from "./base";

/** An AI client installed on this machine that can think for the app, on its own subscription. */
export type HarnessId = "claude" | "codex" | "gemini" | "cursor";

export interface HarnessStatus {
  id: HarnessId;
  name: string;
  install: string;
  /** Null: not installed. */
  version: string | null;
  auth: "subscription" | "api_key" | "none";
  /** The sign-in opens the client's own app, which closes by itself once signed in. */
  interactiveLogin: boolean;
}

export interface LocalModels {
  /** A client's id = that installed client; `account` = the linked account; `own` = own keys or a local model. */
  source: HarnessId | "account" | "own";
  bindings: Record<ModelClass, string>;
  ollamaUrl: string;
  keys: { gateway: boolean; openai: boolean; anthropic: boolean };
}

/** What the person says about themselves; the avatar shows the name's initials. */
export interface UserProfile {
  name: string;
  about: string;
  email: string;
  phone: string;
}

/** The first letters of a name's words, at most two: what an avatar without a picture shows. */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export interface Me {
  user: { id: string; name: string; email: string; image?: string | null };
  profile: UserProfile;
  tenant: { id: string; role: "owner" | "admin" | "member" };
  /** `managed`: signed in at the Manage-App. `local`: this runtime runs alone (desktop app, own machine). */
  mode: "managed" | "local";
  /** The tenant's balance; null where no credits are involved. */
  credits: number | null;
  /** Where account, members, API keys and credits are managed. */
  manageUrl: string | null;
  /** The account a local runtime is linked to. */
  account: {
    name: string;
    email: string;
    credits: number | null;
    url: string;
    cloudUrl: string;
    signedIn: boolean;
  } | null;
  models: LocalModels | null;
  /** The AI clients this runtime can think with — installed or not, and how each is signed in. */
  harnesses: HarnessStatus[];
  /** Installed AI clients whose subscription can answer the studio chat. */
  subscriptions: "claude"[];
  /** A runtime that runs alone walks the person through its setup on first start. */
  setupDone: boolean;
  /** What answers the studio chat. */
  chatEngine: "models" | "claude";
  aiReady: boolean;
  /** Where an admin's own MCP client (Claude Code, Cursor, Codex) connects. */
  mcpUrl: string;
  /** `projects`: how many projects the tenant works with. */
  limits: { projects: number };
}

/** Whether the studio deals with several projects at all: with one, there is nothing to switch. */
export function useManyProjects(): boolean {
  return (useMe().data?.limits.projects ?? 1) > 1;
}

/** The credits a person can spend right now, wherever they come from. */
export function spendableCredits(me: Me): number | null {
  if (me.mode === "managed") {
    return me.credits;
  }
  return me.models?.source === "account" ? (me.account?.credits ?? null) : null;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<Me>("/api/studio/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 30_000,
  });
}

export interface Project {
  id: string;
  name: string;
  brand: { name?: string; about?: string; colors?: BrandColor[] };
  facts: ProjectFact[];
  mcpServers: { id: string; name: string; url: string; headers?: Record<string, string> }[];
  wizardCount: number;
}

export function useProjects(enabled = true) {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/studio/projects"),
    enabled,
  });
}

const KEY = "wz.project";

function readStored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** The pick, shared by every component that asks: the switcher and the list it switches. */
let picked = readStored();
const listeners = new Set<() => void>();

function pick(next: string) {
  picked = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // per-browser convenience only
  }
  for (const listener of listeners) {
    listener();
  }
}

/** The project the studio is looking at; remembered per browser. */
export function useCurrentProject() {
  const projects = useProjects();
  const id = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => picked,
  );
  const list = projects.data ?? [];
  // A pick that is gone (deleted, another tenant) falls back to the first project.
  const current = list.find((p) => p.id === id) ?? list[0] ?? null;
  return { project: current, projects: list, select: pick, loading: projects.isLoading };
}

export interface WizardSummary {
  id: string;
  projectId: string;
  title: string;
  description: string;
  avatar: string;
  revision: number;
  published: boolean;
  publishedVersion: number | null;
  shareToken: string;
  shareEnabled: boolean;
  dailyRunLimit: number;
  stepCount: number;
  updatedAt: string;
}

export interface WizardDetail extends WizardSummary {
  draft: WizardDefinition;
  files: WorkspaceFile[];
  issues: { stepId?: string; message: string }[];
  blank: boolean;
  dirty: boolean;
  messages: {
    id: string;
    role: "user" | "assistant";
    content: string;
    changed: boolean;
    source: "studio" | "mcp";
    client: string | null;
  }[];
  mcpServers: { id: string; name: string }[];
  shareUrl: string;
  studioUrl: string;
}

export function useRefreshMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["me"] });
}

export async function signOut() {
  await fetch(withBase("/api/auth/sign-out"), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  window.location.href = `${STUDIO}/`;
}

/** Sign-in happens at the Manage-App; it sends the person back to `returnTo`. */
export function signIn(returnTo = window.location.pathname) {
  window.location.href = withBase(`/api/auth/login?return=${encodeURIComponent(returnTo)}`);
}
