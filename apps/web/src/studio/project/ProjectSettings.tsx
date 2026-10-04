import type { BrandColor, ProjectFact } from "@engenty-wizards/shared/projects";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import type { Project } from "../../lib/session";
import { Button, Dialog, IconButton, Input, Label, Textarea } from "../../ui";
import { ProjectSwitcher } from "../HomePage";
import { Assistant } from "./Assistant";
import { Colors } from "./Colors";
import { useAutosave, useProjectFiles } from "./data";
import { Facts } from "./Facts";
import { Assets, Documents, Logos } from "./Files";
import { Section } from "./Section";

type Patch = {
  name?: string;
  brand?: { name?: string; about?: string; colors?: BrandColor[] };
  facts?: ProjectFact[];
};

function Base({ project, save }: { project: Project; save: (patch: Patch) => Promise<unknown> }) {
  const [title, setTitle] = useState(project.brand.name ?? "");
  const [about, setAbout] = useState(project.brand.about ?? "");
  const status = useAutosave({ name: title.trim(), about: about.trim() }, (brand) =>
    save({ brand }),
  );
  return (
    <Section title={t("project.base")} hint={t("project.baseHint")} save={status}>
      <div className="flex flex-col gap-5">
        <div>
          <Label hint={t("project.titleHint")}>{t("project.title")}</Label>
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label hint={t("project.aboutHint")}>{t("project.about")}</Label>
          <Textarea minRows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
        </div>
      </div>
    </Section>
  );
}

/** The project's own name: what the switcher calls it, never shown to end users. */
function Rename({ project, save }: { project: Project; save: (patch: Patch) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const rename = useMutation({
    mutationFn: () => save({ name: name.trim() }),
    onSuccess: () => setOpen(false),
  });
  return (
    <>
      <IconButton
        label={t("project.rename")}
        onClick={() => {
          setName(project.name);
          setOpen(true);
        }}
      >
        <Pencil className="size-4" />
      </IconButton>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("project.rename")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              rename.mutate();
            }
          }}
        >
          <Input autoFocus value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          {rename.error ? (
            <p className="mt-3 text-[14px] text-rose">{(rename.error as Error).message}</p>
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

/**
 * What a project gives all its wizards: who it is, its logos and colours, assets, documents and
 * facts. Every section saves by itself; the assistant fills them in from a description, a
 * website or files.
 */
export function ProjectSettings({ project }: { project: Project }) {
  const qc = useQueryClient();
  const files = useProjectFiles(project.id);
  // What the assistant wrote is shown by mounting the sections again with the new project.
  const [rev, setRev] = useState(0);
  const save = async (patch: Patch) => {
    await api.patch(`/api/studio/projects/${project.id}`, patch);
    await qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const remove = useMutation({
    mutationFn: () => api.del(`/api/studio/projects/${project.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
  const data = files.data ?? { files: [], embeddings: true };
  const key = `${project.id}:${rev}`;
  return (
    // The lower padding leaves room for the assistant's dock under the last section.
    <div className="flex flex-col gap-9 pb-20">
      <div className="-mb-3 flex items-center gap-1">
        <ProjectSwitcher />
        <Rename project={project} save={save} />
      </div>
      <Assistant key={project.id} projectId={project.id} onChanged={() => setRev((n) => n + 1)} />
      <Base key={`base:${key}`} project={project} save={save} />
      <Logos projectId={project.id} data={data} />
      <Colors
        key={`colors:${key}`}
        colors={project.brand.colors ?? []}
        save={(colors) => save({ brand: { colors } })}
      />
      <Assets projectId={project.id} data={data} />
      <Documents projectId={project.id} data={data} />
      <Facts key={`facts:${key}`} facts={project.facts} save={(facts) => save({ facts })} />
      <div>
        <Button
          variant="danger"
          busy={remove.isPending}
          onClick={() => confirm(`${t("settings.delete")}?`) && remove.mutate()}
        >
          {t("settings.delete")}
        </Button>
        {remove.error ? (
          <p className="mt-2 text-[14px] text-rose">{(remove.error as Error).message}</p>
        ) : null}
      </div>
    </div>
  );
}
