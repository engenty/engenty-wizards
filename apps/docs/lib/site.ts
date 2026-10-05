/** The path the site is served under: `basePath` in next.config.mjs. Links made by hand need it. */
export const BASE_PATH = "/docs";

export const GITHUB_URL = "https://github.com/engenty/engenty-wizards";

/** Where a page's file is on GitHub. `path` is the page's path below docs/content. */
export function githubUrlForPage(path: string): string {
  return `${GITHUB_URL}/blob/main/docs/content/${path}`;
}
