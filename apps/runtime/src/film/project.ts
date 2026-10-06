import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { dataRef, FILM_SIZES, type FilmStep } from "@engenty-wizards/shared/definition";
import { unzipSync } from "fflate";
import { renderTemplate, resolveRef } from "../engine/template.js";
import type { StepContext } from "../engine/types.js";
import { env } from "../env.js";
import { getBlob } from "../files/blobs.js";
import { extFor, loadAsset } from "../files/storage.js";
import { projectFileContent } from "../services/project-files.js";
import { placeSkills } from "./skills.js";
import { soundCatalog } from "./sounds.js";
import { runHyperframes } from "./tools.js";

/**
 * The folder a film is made in: one per run and step, kept after the run so a later change edits
 * the code instead of starting over. Laid out for the client:
 *
 *   BRIEF.md            what to make (the step's brief, the format, the length)
 *   CLAUDE.md, AGENTS.md the rules of the folder
 *   .claude/skills/     the skill packages
 *   showcase/           the wizard's style kit, the bar to reach
 *   brand/              the space's brand: brand.json, logos
 *   input/              what this run made before: voice lines, pictures, texts, uploads
 *   audio-catalog/      the only sounds the film may use
 *   film/               the HyperFrames project; renders/film.mp4 is the result
 */
export function filmRoot(runId: string, stepId: string): string {
  return join(env.dataDir, "films", runId, stepId);
}

const SESSION = join(".engenty", "session");

export async function savedSession(root: string): Promise<string | null> {
  try {
    return (await readFile(join(root, SESSION), "utf8")).trim() || null;
  } catch {
    return null;
  }
}

export async function saveSession(root: string, id: string) {
  await mkdir(join(root, ".engenty"), { recursive: true });
  await writeFile(join(root, SESSION), id);
}

/** Writes bytes to a path inside `root`; a name that would leave it is refused. */
async function put(root: string, rel: string, data: Uint8Array | string) {
  const path = normalize(join(root, rel));
  if (!path.startsWith(`${root}/`)) {
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

const safeName = (name: string) =>
  name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "file";

function rules(step: FilmStep, skills: string[]): string {
  const size = FILM_SIZES[step.format];
  return `# The film folder

You make one film here, autonomously, to the end. Nobody answers questions: where a skill asks the
person, decide yourself and note it in PROGRESS.md.

- **What to make:** BRIEF.md. **The bar:** showcase/ (read showcase/SHOWCASE.md and showcase/frame.md
  first when it exists, look at its stills, reuse its helpers from showcase/assets/). **The brand:**
  brand/brand.json and brand/logos/ — colours, logo and fonts come from there only.
- **Material:** input/ (see input/README.md). Use nothing from the web; you have no network.
- **Skills:** ${skills.join(", ")} in .claude/skills/<name>/SKILL.md. Start with \`hyperframes\` and
  read the skill files directly; do not update or install skills.
- **The HyperFrames project is film/** (${size.width}×${size.height}, already set up). Keep every file
  of the film inside film/.
- **Running HyperFrames:** only through the \`hyperframes\` tool (MCP server \`film\`), e.g.
  \`["lint","film"]\`, \`["check","film"]\`, \`["snapshot","film","--at","1,4,8"]\`,
  \`["render","film","-q","draft"]\`, \`["transcribe","input/voice/l01.wav","--json","-d","input/voice"]\`.
  \`npx\`, \`npm\` and network do not work in the shell.
- **Look at your work:** snapshot the frames and read the PNGs, fix what is wrong. Before you finish,
  render a draft and look at a frame every second of the whole film: empty areas, cut-off text,
  overlaps, jumps.
- **Finish** only when \`["check","film"]\` passes and \`["render","film","-q","draft"]\` succeeds, with \`film/index.html\` complete. The runtime renders the final MP4 itself.
  End with a short summary: what the film shows, what you decided.

## Sound (hard rules)

- Sounds come only from audio-catalog/ (catalog.json lists each file with tags, keywords, licence).
  Copy the picked files into film/assets/ and list them in film/AUDIO.md (file, source, licence, use).
- Never generate, synthesize or download audio: no ffmpeg tone or noise, no TTS, no music models. Voice
  lines come only from input/. Mixing is HyperFrames' job (\`<audio>\` with start, duration, volume).
- Install nothing (no pip, brew, npm).
`;
}

/** Sets up the folder for a first attempt; a later attempt finds it as it was left. */
export async function prepareFilmFolder(
  step: FilmStep,
  ctx: StepContext,
): Promise<{ root: string; brief: string }> {
  const root = filmRoot(ctx.runId, step.id);
  const brief = renderTemplate(step.brief, ctx.scope).trim();
  // The same brief and material as last time: the film is there to go on with or to change.
  const stamp = createHash("sha256")
    .update(
      JSON.stringify([
        brief,
        Object.values(step.inputs).map((raw) => {
          const ref = dataRef(raw);
          const [head, id] = ref.split(".");
          return head === "steps" ? ctx.state.outputs[id]?.at : ctx.state.values[ref];
        }),
      ]),
    )
    .digest("hex");
  const stampFile = join(root, ".engenty", "inputs");
  const same = existsSync(stampFile) && (await readFile(stampFile, "utf8")) === stamp;
  if (same && existsSync(join(root, "film", "index.html")) && (await savedSession(root))) {
    return { root, brief };
  }
  await rm(root, { recursive: true, force: true });
  await mkdir(root, { recursive: true });

  const skills = await placeSkills(step.skills, ctx.files, join(root, ".claude", "skills"));
  const size = FILM_SIZES[step.format];

  await put(
    root,
    "BRIEF.md",
    `# Brief\n\nFormat ${step.format}, ${size.width}×${size.height}${
      step.seconds ? `, about ${step.seconds} s` : ""
    }. Language of all text on screen: the brief's language.\n\n${brief}\n`,
  );
  const text = rules(step, skills);
  await put(root, "CLAUDE.md", text);
  await put(root, "AGENTS.md", text);

  // The style kit.
  if (step.kit) {
    const file = ctx.files.find((f) => f.path === step.kit);
    if (file) {
      const entries = unzipSync(new Uint8Array(await getBlob(file.hash)));
      for (const [name, data] of Object.entries(entries)) {
        if (!name.endsWith("/")) {
          await put(join(root, "showcase"), name.replace(/^showcase\//, ""), data);
        }
      }
    }
  }

  // The space's brand.
  const b = ctx.scope.brand;
  const logos: string[] = [];
  for (const f of ctx.projectFiles.filter((p) => p.kind === "logo")) {
    try {
      const { data } = await projectFileContent(f.projectId, f.id);
      const name = `logos/${safeName(f.name.replace(/\.[^.]+$/, ""))}.${extFor(f.mime) === "bin" ? (f.name.split(".").pop() ?? "bin") : extFor(f.mime)}`;
      await put(join(root, "brand"), name, data);
      logos.push(name);
    } catch {
      // a logo less
    }
  }
  await put(
    join(root, "brand"),
    "brand.json",
    JSON.stringify(
      {
        note: "The space's brand. Colours are named by what they are for; the first is the accent.",
        name: b.name ?? "",
        about: b.about ?? "",
        colors: (b.colors ?? []).map((c) => ({ name: c.name, value: c.value })),
        logos,
        facts: (b.facts ?? []).map((f) => `${f.label}: ${f.value}`),
      },
      null,
      1,
    ),
  );

  // What the run made before.
  const listed: string[] = [];
  for (const [name, raw] of Object.entries(step.inputs)) {
    const ref = dataRef(raw);
    const [head, id] = ref.split(".");
    const output = head === "steps" ? ctx.state.outputs[id] : undefined;
    const assetIds =
      head === "steps"
        ? (output?.assets ?? []).map((a) => a.id)
        : ([ctx.state.values[ref]].flat().filter((v) => typeof v === "string") as string[]);
    let n = 0;
    for (const assetId of assetIds) {
      const found = await loadAsset(assetId);
      if (found && found.row.runId === ctx.runId) {
        const file = `${name}/${safeName(found.row.name)}`;
        await put(join(root, "input"), file, found.data);
        listed.push(`- \`input/${file}\` (${found.row.mime})`);
        n++;
      }
    }
    if (head === "steps" && output?.json !== undefined) {
      await put(join(root, "input"), `${name}.json`, JSON.stringify(output.json, null, 1));
      listed.push(`- \`input/${name}.json\``);
    } else if (head === "steps" && output?.text) {
      await put(join(root, "input"), `${name}.md`, output.text);
      listed.push(`- \`input/${name}.md\``);
    } else if (!n) {
      const value = resolveRef(ref, ctx.scope);
      if (value !== undefined && value !== null && value !== "") {
        await put(
          join(root, "input"),
          `${name}.md`,
          typeof value === "string" ? value : JSON.stringify(value, null, 1),
        );
        listed.push(`- \`input/${name}.md\``);
      }
    }
  }
  await put(
    join(root, "input"),
    "README.md",
    `# Material for this film\n\n${listed.join("\n") || "(none)"}\n\nVoice lines play one after another in their order; their lengths decide the timing.\n`,
  );

  await cp(await soundCatalog(), join(root, "audio-catalog"), { recursive: true });

  // The HyperFrames project, set up for the format.
  const preset = { "16:9": "landscape", "9:16": "portrait", "1:1": "square" }[step.format];
  const init = await runHyperframes(
    ["init", "film", "--non-interactive", "--skip-transcribe", `--resolution=${preset}`],
    { cwd: root, signal: ctx.signal, timeoutMs: 5 * 60_000 },
  );
  if (init.code !== 0 || !existsSync(join(root, "film"))) {
    throw new Error(`Das Filmprojekt konnte nicht angelegt werden: ${init.out.slice(-300)}`);
  }
  await put(root, ".engenty/inputs", stamp);
  return { root, brief };
}
