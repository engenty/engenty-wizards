import type { WizardDefinition } from "@shared/definition";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, api } from "./api";

export interface Me {
  user: { id: string; name: string; email: string; image?: string | null };
  billing: {
    plan: "free" | "pro";
    credits: number;
    allowance: number;
    topup: number;
    resetAt: string | null;
    monthly: number;
    hasCustomer: boolean;
  };
  billingEnabled: boolean;
  aiReady: boolean;
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
  issues: { stepId?: string; message: string }[];
  blank: boolean;
  dirty: boolean;
  messages: { id: string; role: "user" | "assistant"; content: string; changed: boolean }[];
  mcpServers: { id: string; name: string }[];
  shareUrl: string;
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

export async function signInSocial(provider: string) {
  const res = await api.post<{ url?: string }>("/api/auth/sign-in/social", {
    provider,
    callbackURL: "/",
  });
  if (res.url) {
    window.location.href = res.url;
  }
}
