import { SvgXml } from "react-native-svg";
import { ENGENTY_SVG, type EngentyKind } from "./shapes";

/** A wizard's engenty, flat and still, straight on the stage (no tile behind it). */
export function Engenty({ kind, size }: { kind: string; size: number }) {
  const xml = ENGENTY_SVG[kind as EngentyKind] ?? ENGENTY_SVG.round;
  return <SvgXml xml={xml} width={size} height={size} />;
}
