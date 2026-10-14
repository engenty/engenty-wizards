import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { type Project, spaceName } from "../../lib/session";
import { Button, Dialog, IconButton, Input } from "../../ui";
import { ProjectSwitcher } from "../HomePage";

type Patch = { name: string };

/** The project's own name: what the switcher calls it, never shown to end users. */
function Rename({ project, save }: { project: Project; save: (patch: Patch) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(spaceName(project));
  const rename = useMutation({
    mutationFn: () => save({ name: name.trim() }),
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <IconButton
        label={t("project.rename")}
        onClick={() => {
          setName(spaceName(project));
          setOpen(true);
        }}
      >
        <Pencil className="size-4" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("project.rename")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            // Unchanged, the shown name stays a stand-in: saving it would pin the title of
            // today, or one language's "My wizards", as the space's own name.
            if (name.trim() === spaceName(project)) {
              setOpen(false);
            } else if (name.trim()) {
              rename.mutate();
            }
          }}
        >
          <Input
            data-autofocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
          {rename.error ? (
            <p className="mt-3 text-[0.875rem] text-rose">{(rename.error as Error).message}</p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" busy={rename.isPending} disabled={!name.trim()}>
              {t("settings.save")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** With several spaces: which one the page shows, and its own name. */
export function SpaceSwitcher({ project }: { project: Project }) {
  const qc = useQueryClient();
  const save = async (patch: Patch) => {
    await api.patch(`/api/studio/projects/${project.id}`, patch);
    await qc.invalidateQueries({ queryKey: ["projects"] });
  };
  return (
    <div className="flex items-center gap-1">
      <ProjectSwitcher />
      {project.readOnly ? null : <Rename project={project} save={save} />}
    </div>
  );
}
