import { lazy, Suspense } from "react";
import type { EngentyKind } from "./engenty/colors";
import { Engenty } from "./engenty/engenty";
import { EngentyLogoMark } from "./engenty/logo";

export const BRAND = {
  name: "engenty wizards",
  short: "wizards",
};

const Fluffy = lazy(() =>
  import("./engenty/fluffy-engenty").then((m) => ({ default: m.FluffyEngenty })),
);

/**
 * The engenty a wizard wears. Large sizes get the fur coat; small ones stay flat,
 * where fur would read as noise.
 */
export function Mascot({
  kind,
  size = 64,
  fluffy,
  interactive = true,
}: {
  kind: string;
  size?: number;
  fluffy?: boolean;
  interactive?: boolean;
}) {
  const k = (kind || "round") as EngentyKind;
  if (fluffy && size >= 120) {
    return (
      <Suspense fallback={<Engenty kind={k} size={Math.round(size * 0.62)} />}>
        <Fluffy kind={k} size={size} quality="medium" interactive={interactive} />
      </Suspense>
    );
  }
  return <Engenty kind={k} size={size} animated={interactive} />;
}

export function Logo({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-full pr-2 text-ink"
    >
      <EngentyLogoMark size={30} />
      <span className="font-display font-semibold text-[17px] tracking-tight">
        engenty<span className="text-ember">.</span>
        <span className="ml-1 font-normal text-ink-3">{BRAND.short}</span>
      </span>
    </button>
  );
}
