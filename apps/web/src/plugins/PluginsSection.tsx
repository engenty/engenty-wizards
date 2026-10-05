import { RotateCw } from "lucide-react";
import { useState } from "react";
import { t } from "../lib/i18n";
import { Section } from "../studio/project/Section";
import { Button, Chip, IconButton } from "../ui";
import { reloadPlugins, useStudioPlugins } from "./host";

/**
 * The plugins this tenant has, and what became of each when it loaded. Where the runtime runs
 * alone a plugin can be loaded again from its files; a runtime of many tenants never does that.
 */
export function PluginsSection() {
  const plugins = useStudioPlugins();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = async (id?: string) => {
    setBusy(id ?? "*");
    setError(null);
    try {
      await reloadPlugins(id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Section
      title={t("plugins.title")}
      hint={plugins.canReload ? t("plugins.hint") : t("plugins.hintManaged")}
      action={
        plugins.canReload ? (
          <Button variant="secondary" busy={busy === "*"} onClick={() => void reload()}>
            {t("plugins.rescan")}
          </Button>
        ) : null
      }
    >
      <ul className="divide-y divide-border-soft">
        {plugins.plugins.map((plugin) => {
          const studioError = plugins.failed[plugin.id];
          return (
            <li key={plugin.id} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-medium text-[15px]">{plugin.name}</span>
                  {/* A plugin of one file has no name and no version of its own. */}
                  {plugin.name !== plugin.id ? (
                    <span className="font-mono text-[12px] text-ink-4">
                      {plugin.id} · {plugin.version}
                    </span>
                  ) : null}
                </div>
                {plugin.description ? (
                  <p className="mt-0.5 text-[14px] text-ink-3">{plugin.description}</p>
                ) : null}
                {plugin.tools.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
                    {t("plugins.tools")}
                    {plugin.tools.map((tool) => (
                      <Chip key={tool.id}>{tool.id}</Chip>
                    ))}
                  </div>
                ) : null}
                {plugin.error ? (
                  <p className="mt-2 text-[13px] text-rose">
                    {t("plugins.serverFailed", { error: plugin.error })}
                  </p>
                ) : null}
                {studioError ? (
                  <p className="mt-2 text-[13px] text-rose">
                    {t("plugins.studioFailed", { error: studioError })}
                  </p>
                ) : null}
              </div>
              {plugins.canReload ? (
                <IconButton
                  label={t("plugins.reload")}
                  disabled={busy !== null}
                  onClick={() => void reload(plugin.id)}
                >
                  <RotateCw className={busy === plugin.id ? "size-4 animate-spin" : "size-4"} />
                </IconButton>
              ) : null}
            </li>
          );
        })}
        {plugins.problems.map((problem) => (
          <li key={problem.path} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Chip tone="warn">{t("plugins.problems")}</Chip>
              <span className="break-all font-mono text-[12px] text-ink-3">{problem.path}</span>
            </div>
            <p className="mt-1.5 text-[13px] text-ink-3">{problem.message}</p>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-4 text-[13px] text-rose">{error}</p> : null}
    </Section>
  );
}
