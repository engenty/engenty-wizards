import type { ModelClass, WizardDefinition } from "@engenty-wizards/shared/definition";
import type { WorkspaceFile } from "@engenty-wizards/shared/workspace";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "./api";

/** An AI client installed on this machine that can think for the app, on its own subscription. */
export type HarnessId = "claude" | "codex" | "gemini" | "cursor";

export interface HarnessStatus {
  id: HarnessId;
  name: string;
  install: string;
  /** The client's own page. */
  site: string;
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

export interface Me {
  user: { id: string; name: string; email: string; image?: string | null };
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
  brand: { name?: string; details?: string; accent?: string; logoAssetId?: string };
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

/** The project the studio is looking at; remembered per browser. */
export function useCurrentProject() {
  const projects = useProjects();
  const [id, setId] = useState<string | null>(readStored);
  const list = projects.data ?? [];
  const current = list.find((p) => p.id === id) ?? list[0] ?? null;
  useEffect(() => {
    if (current && current.id !== id) {
      setId(current.id);
    }
  }, [current, id]);
  const select = (next: string) => {
    setId(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // per-browser convenience only
    }
  };
  return { project: current, projects: list, select, loading: projects.isLoading };
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
  await fetch("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  window.location.href = "/";
}

/** Sign-in happens at the Manage-App; it sends the person back to `returnTo`. */
export function signIn(returnTo = window.location.pathname) {
  window.location.href = `/api/auth/login?return=${encodeURIComponent(returnTo)}`;
}
