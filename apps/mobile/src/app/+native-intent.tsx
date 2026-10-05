import { DEFAULT_RUNTIME } from "../data/links";

/**
 * Every address the system opens the app with — a wizard's or result's link on engenty.ai
 * (Universal Links, App Links), or `engenty-wizards://w?url=…` from a runner on another host —
 * goes to /link, which knows the wizards on this phone.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (/^(https?|engenty-wizards):/i.test(path)) {
      return `/link?url=${encodeURIComponent(path)}`;
    }
    if (/^\/?(w|s)\//.test(path)) {
      return `/link?url=${encodeURIComponent(`${DEFAULT_RUNTIME}/${path.replace(/^\//, "")}`)}`;
    }
    return path;
  } catch {
    return "/";
  }
}
