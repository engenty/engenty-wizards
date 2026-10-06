import type { BrandColor, ProjectFact } from "@engenty-wizards/shared/projects";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { type Project, useManyProjects } from "../../lib/session";
import { Button, Input, Label, Textarea } from "../../ui";
import { projectReadOnlyText, ReadOnlyNote } from "../ReadOnly";
import { Assistant } from "./Assistant";
import { Colors } from "./Colors";
import { Documents } from "./Documents";
import { useAutosave, useProjectFiles } from "./data";
import { Facts } from "./Facts";
import { Assets, Logos } from "./Files";
import { Anchor, Section } from "./Section";

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
    <Section
      title={t("project.base")}
      hint={t("project.baseHint")}
      save={status}
      locked={project.readOnly}
    >
      <div className="flex flex-col gap-5">
        <div>
          <Label>{t("project.title")}</Label>
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          <p className="mt-1.5 text-[0.8125rem] text-ink-3">{t("project.titleHint")}</p>
        </div>
        <div>
          <Label>{t("project.about")}</Label>
          <Textarea minRows={4} value={about} onChange={(e) => setAbout(e.target.value)} />
          <p className="mt-1.5 text-[0.8125rem] text-ink-3">{t("project.aboutHint")}</p>
        </div>
      </div>
    </Section>
  );
}

/**
 * What a project gives all its wizards, in two parts of the space page: `info` — who it is, its
 * logos and colours, assets and facts — and `knowledge` — its documents. Every section saves by
 * itself; the assistant above both fills them in from a description, a website or files, and
 * stays when the person switches between them. A read-only project (a local install's, or on a
 * server where nothing is built) shows the same sections, and a note stands where the assistant
 * would. `children`: the sections plugins add to the part, after its own.
 */
export function ProjectSettings({
  project,
  group,
  children,
}: {
  project: Project;
  group: "info" | "knowledge";
  children?: ReactNode;
}) {
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
  // With one project there is nothing to switch, to name apart or to delete.
  const many = useManyProjects();
  const data = files.data ?? { files: [], embeddings: true };
  const key = `${project.id}:${rev}`;
  const readOnly = project.readOnly;
  return (
    // The lower padding leaves room for the assistant's dock under the last section.
    <div className="flex flex-col gap-9 pb-20">
      {readOnly ? (
        <ReadOnlyNote>{projectReadOnlyText(project)}</ReadOnlyNote>
      ) : (
        <Assistant key={project.id} projectId={project.id} onChanged={() => setRev((n) => n + 1)} />
      )}
      {group === "info" ? (
        <>
          <Anchor id="base">
            <Base key={`base:${key}`} project={project} save={save} />
          </Anchor>
          <Anchor id="logos">
            <Logos projectId={project.id} data={data} readOnly={readOnly} />
          </Anchor>
          <Anchor id="colors">
            <Colors
              key={`colors:${key}`}
              colors={project.brand.colors ?? []}
              save={(colors) => save({ brand: { colors } })}
              readOnly={readOnly}
            />
          </Anchor>
          <Anchor id="assets">
            <Assets projectId={project.id} data={data} readOnly={readOnly} />
          </Anchor>
          <Anchor id="facts">
            <Facts
              key={`facts:${key}`}
              facts={project.facts}
              save={(facts) => save({ facts })}
              readOnly={readOnly}
            />
          </Anchor>
        </>
      ) : (
        <Anchor id="documents">
          <Documents projectId={project.id} data={data} readOnly={readOnly} />
        </Anchor>
      )}
      {children}
      {group === "info" && many && !readOnly ? (
        <div>
          <Button
            variant="danger"
            busy={remove.isPending}
            onClick={() => confirm(`${t("settings.delete")}?`) && remove.mutate()}
          >
            {t("settings.delete")}
          </Button>
          {remove.error ? (
            <p className="mt-2 text-[0.875rem] text-rose">{(remove.error as Error).message}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
