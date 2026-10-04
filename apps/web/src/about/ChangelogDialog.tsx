import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { cn, Dialog, Empty, Input, Spinner } from "../ui";

interface ChangelogCommit {
  id: string;
  message: string;
  group: string | null;
  scope: string | null;
  breaking: boolean;
}

interface ChangelogRelease {
  /** Null: not released yet. */
  version: string | null;
  timestamp: number | null;
  commits: ChangelogCommit[];
}

/** The groups of cliff.toml: their name on the page and the colour of their dot. */
function groupOf(commit: ChangelogCommit): { label: string; dot: string } {
  switch (commit.group) {
    case "Added":
      return { label: t("about.group.added"), dot: "bg-moss" };
    case "Fixed":
      return { label: t("about.group.fixed"), dot: "bg-amber" };
    case "Changed":
      return { label: t("about.group.changed"), dot: "bg-cobalt" };
    case "Performance":
      return { label: t("about.group.performance"), dot: "bg-ember" };
    case "Deploy":
      return { label: t("about.group.deploy"), dot: "bg-ink-4" };
    case "Docs":
      return { label: t("about.group.docs"), dot: "bg-ink-4" };
    default:
      return { label: t("about.group.other"), dot: "bg-ink-4" };
  }
}

const releaseLabel = (release: ChangelogRelease) =>
  release.version ? release.version.replace(/^v/, "") : t("about.unreleased");

const releaseDate = (release: ChangelogRelease) =>
  release.timestamp ? new Date(release.timestamp * 1000).toISOString().slice(0, 10) : "";

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The releases a search leaves: a hit on the version or date keeps the release whole. */
function filterReleases(releases: ChangelogRelease[], query: string): ChangelogRelease[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return releases;
  }
  const out: ChangelogRelease[] = [];
  for (const release of releases) {
    if (`${releaseLabel(release)} ${releaseDate(release)}`.toLowerCase().includes(q)) {
      out.push(release);
      continue;
    }
    const commits = release.commits.filter((commit) =>
      `${groupOf(commit).label} ${commit.scope ?? ""} ${commit.message}`.toLowerCase().includes(q),
    );
    if (commits.length > 0) {
      out.push({ ...release, commits });
    }
  }
  return out;
}

/** What changed from release to release: apps/web/src/about/changelog.json, written by `pnpm release`. */
export function ChangelogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [releases, setReleases] = useState<ChangelogRelease[] | null>(null);
  const [query, setQuery] = useState("");

  // The data is its own chunk, fetched when the dialog first opens.
  useEffect(() => {
    if (!open || releases) {
      return;
    }
    let cancelled = false;
    void import("./changelog.json").then((mod) => {
      if (!cancelled) {
        setReleases(mod.default as ChangelogRelease[]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, releases]);

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const visible = releases ? filterReleases(releases, query) : [];

  return (
    <Dialog open={open} onClose={onClose} title={t("about.changelog")} wide>
      <p className="-mt-3 mb-4 text-[14px] text-ink-3">{t("about.changelogHint")}</p>
      {releases === null ? (
        <div className="flex justify-center py-10 text-ink-3">
          <Spinner />
        </div>
      ) : releases.length === 0 ? (
        <Empty>{t("about.changelogEmpty")}</Empty>
      ) : (
        <>
          <Input
            type="search"
            value={query}
            placeholder={t("about.search")}
            onChange={(e) => setQuery(e.target.value)}
          />
          {visible.length === 0 ? <Empty>{t("about.noMatches")}</Empty> : null}
          {visible.map((release) => (
            <section key={release.version ?? "unreleased"} className="mt-6">
              <h3 className="flex items-baseline gap-3 border-border-soft border-b pb-2 font-display font-semibold text-[16px]">
                {releaseLabel(release)}
                <span className="font-normal font-sans text-[13px] text-ink-3 tabular-nums">
                  {releaseDate(release)}
                </span>
              </h3>
              <ul className="mt-3 flex flex-col gap-2">
                {release.commits.map((commit) => {
                  const group = groupOf(commit);
                  return (
                    <li key={commit.id} className="flex items-start gap-2.5 text-[14px]">
                      <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", group.dot)} />
                      <span className="min-w-0 text-ink-2">
                        <span className="font-medium text-ink">
                          {group.label}
                          {commit.scope ? ` [${commit.scope}]` : ""}:
                        </span>{" "}
                        {upperFirst(commit.message)}
                        {commit.breaking ? (
                          <span className="ml-1.5 rounded-full bg-rose-tint px-1.5 py-0.5 font-medium text-[12px] text-rose">
                            {t("about.breaking")}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </>
      )}
    </Dialog>
  );
}
