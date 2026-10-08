import { IconButton } from "@engenty-wizards/web/ui";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { t } from "./app";

/** A value to take along: the webhook address, the verify token, the link. */
export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <IconButton
      label={t(done ? "copied" : "copy")}
      className="size-8"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
    </IconButton>
  );
}

/** A value shown as it is, with the button that copies it. */
export function Shown({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="text-[0.8125rem] text-ink-3">{label}</div>
        <div className="select-all truncate font-mono text-[0.8125rem]">{value}</div>
      </div>
      <CopyButton text={value} />
    </div>
  );
}
