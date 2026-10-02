import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { lang, t } from "../../lib/i18n";
import { Chip, Empty } from "../../ui";

interface RunRow {
  id: string;
  mode: "test" | "live";
  status: string;
  version: number | null;
  createdAt: string;
  credits: number;
  assets: number;
  stepTitle: string | null;
}

const STATUS: Record<string, string> = {
  waiting_input: "wartet",
  running: "läuft",
  done: "fertig",
  failed: "Fehler",
  cancelled: "abgebrochen",
};

export function RunsPanel({
  wizardId,
  onOpen,
}: {
  wizardId: string;
  onOpen: (runId: string) => void;
}) {
  const runs = useQuery({
    queryKey: ["runs", wizardId],
    queryFn: () => api.get<RunRow[]>(`/api/studio/wizards/${wizardId}/runs`),
    refetchInterval: 10_000,
  });
  if (runs.data && !runs.data.length) {
    return <Empty>{t("editor.noRuns")}</Empty>;
  }
  const fmt = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="flex flex-col p-2">
      {runs.data?.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onOpen(r.id)}
          className="flex items-center gap-3 rounded-lg px-3 py-3 text-left hover:bg-accent"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[14px]">
              {fmt.format(new Date(r.createdAt))}
              {r.mode === "test" ? <Chip>Test</Chip> : <Chip tone="live">Live v{r.version}</Chip>}
            </div>
            <div className="truncate text-[12px] text-ink-3">
              {STATUS[r.status] ?? r.status}
              {r.stepTitle && r.status !== "done" ? ` · ${r.stepTitle}` : ""}
            </div>
          </div>
          <span className="text-[12px] text-ink-4 tabular-nums">{r.credits} cr</span>
        </button>
      ))}
    </div>
  );
}
