import {
  ApiError,
  api,
  configureRunner,
  type Lang,
  type MascotProps,
  RunnerBody,
} from "@engenty-wizards/runner";
import type { RunView } from "@engenty-wizards/shared/run";
import {
  defineComponent,
  useGetFieldValue,
  useIsStreaming,
  useSetFieldValue,
  useTriggerAction,
} from "@openuidev/react-lang";
import { useEffect, useRef, useState } from "react";
import { WIZARD_COMPONENT, WIZARD_DESCRIPTION, type WizardProps, wizardProps } from "./prompt.js";
import { useWizardRun } from "./run.js";

export interface WizardsConfig {
  /**
   * Where the runtime answers, as the browser reaches it: a path the host proxies to it
   * (`/wizards-runtime`, so its cookie stays first-party) or its address.
   */
  runtime: string;
  /** The language of the runner's own words. */
  lang?: Lang;
  /** The wizard's mascot; a plain dot in the wizard's colour where none is given. */
  Mascot?: (props: MascotProps) => React.ReactNode;
}

/** A plain stand-in for the studio's engenty. */
function Dot({ size = 64 }: MascotProps) {
  const d = Math.min(size, 72);
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-full bg-ember"
      style={{ width: d * 0.6, height: d * 0.6 }}
    />
  );
}

/** Names the runtime the Wizard component talks to. Once, before the first render. */
export function configureWizards(config: WizardsConfig) {
  const base = config.runtime.replace(/\/+$/, "");
  configureRunner({
    lang: config.lang ?? "en",
    runBase: (runId) => `/api/runs/${runId}`,
    withBase: (path) => `${base}${path}`,
    asset: (path) => `${base}/${path.replace(/^\/+/, "")}`,
    Mascot: config.Mascot ?? Dot,
  });
}

/** What the chat hears when a run is done: the result's texts, short. */
function resultContext(view: RunView) {
  const texts = Object.entries(view.outputs)
    .filter(([, out]) => typeof out.text === "string" && out.text.trim())
    .map(([step, out]) => ({ step, text: (out.text ?? "").slice(0, 4000) }));
  return { wizard: view.wizard.title, runId: view.id, results: texts };
}

function WizardRun({ props }: { props: WizardProps }) {
  const streaming = useIsStreaming();
  const getField = useGetFieldValue();
  const setField = useSetFieldValue();
  const trigger = useTriggerAction();
  // The run lives with the message: shown again, the same run continues.
  const key = `wizard:${props.wizard}`;
  const kept = getField(undefined, key) as { runId?: string; reported?: boolean } | undefined;
  const [runId, setRunId] = useState<string | null>(kept?.runId ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const reported = useRef(kept?.reported ?? false);
  const run = useWizardRun(runId, props.prefill);

  useEffect(() => {
    // While the reply streams, the token can still be half written.
    if (streaming || runId || failed || !props.wizard) {
      return;
    }
    let cancelled = false;
    api
      .post<{ runId: string }>(`/api/public/wizards/${encodeURIComponent(props.wizard)}/runs`, {})
      .then(({ runId: id }) => {
        if (!cancelled) {
          setRunId(id);
          setField(undefined, WIZARD_COMPONENT, key, { runId: id }, true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFailed(err instanceof ApiError ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [streaming, runId, failed, props.wizard, key, setField]);

  const view = run.view;
  useEffect(() => {
    if (view?.status !== "done" || reported.current) {
      return;
    }
    reported.current = true;
    setField(undefined, WIZARD_COMPONENT, key, { runId: view.id, reported: true }, true);
    void trigger(`The wizard “${view.wizard.title}” finished.`, undefined, {
      type: "continue_conversation",
      params: { context: resultContext(view) },
    });
  }, [view, key, setField, trigger]);

  return (
    <div className="engenty-runner overflow-hidden rounded-2xl border border-paper-3 bg-paper">
      {props.note ? <p className="px-5 pt-4 text-[0.9375rem] text-ink-2">{props.note}</p> : null}
      <div className="px-5 pb-6">
        {failed ? (
          <p className="py-10 text-center text-ink-3">{failed}</p>
        ) : (
          <RunnerBody run={run} compact />
        )}
      </div>
    </div>
  );
}

/** The component an OpenUI library gets: `Wizard("<token>", "<note>", {prefill})`. */
export const Wizard = defineComponent({
  name: WIZARD_COMPONENT,
  description: WIZARD_DESCRIPTION,
  props: wizardProps,
  component: ({ props }) => <WizardRun props={props} />,
});
