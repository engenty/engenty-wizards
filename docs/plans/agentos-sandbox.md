# agentOS as the sandbox without Docker

Decided 2026-10-17 after a spike with agentOS 0.4.1. Built the same day: the engine
(`apps/runtime/src/sandbox/agentos.ts`), the installer of engines outside the package
(`install.ts`, with agentOS's part in `agentos-package.ts`), `wizards sandbox`, and the image's
`SANDBOX_ENGINES` build argument.

## Why it came back

#32 (2026-10-15) dropped agentOS 0.2.22: it added about 1.75 GB on Linux, most of it
four coding agents nobody here uses (Pi, Claude Code, Codex, opencode). agentOS 0.4.1
(2026-10-12) no longer depends on them, and it runs a lot more than 0.2.22 did.

It stays out of `package.json`. `wizards sandbox add`, `pnpm sandbox:add agentos` or the image's
`SANDBOX_ENGINES=agentos` install it into a folder of its own (`engines/agentos` in
`SANDBOX_ENGINES_DIR`), and the engine loads it from there with `import()`. A computer without it
gets no sandbox, as before.

## Engines

agentOS is one engine among several. Each is a `SandboxEngine` (`sandbox/types.ts`): a name for
`SANDBOX`, whether it is ready here, what it runs (the agent's tool descriptions are written from
that) and a sandbox per run. `ENGINES` in `sandbox/index.ts` lists them in the order one is
picked when `SANDBOX` names none: `docker`, then `agentos`.

Mastra has the same idea, `WorkspaceSandbox`, with providers for Docker, E2B, Daytona and the
local machine. `MastraRunSandbox` (`sandbox/mastra.ts`) makes any of them a run's sandbox; Docker
already goes through it. agentOS has no Mastra provider, so it has its own class.

An engine whose package is not a dependency of the runtime lists it in `ENGINE_PACKAGES`
(`sandbox/install.ts`): its packages at exact versions, its size for the messages, and an
optional `prepare` that runs after npm. `wizards sandbox add <name>` installs it, `wizards status`
shows it and says when this release wants another version, and the engine loads it with
`importFromEngine`. E2B, for example, would look like this:

```ts
// install.ts
e2b: { label: "E2B", version: "0.14.1", packages: ["@mastra/e2b@0.14.1"], size: "about 170 MB" },

// sandbox/e2b.ts, listed in ENGINES
export const e2bEngine: SandboxEngine = {
  name: "e2b",
  ready: () => Boolean(process.env.E2B_API_KEY) && installedVersion(dir()) !== null,
  capabilities: () => E2B_CAPABILITIES,
  create: (runId) =>
    new MastraRunSandbox(E2B_CAPABILITIES, async () => {
      const { E2BSandbox } = (await importFromEngine("e2b", dir(), "@mastra/e2b")) as typeof import("@mastra/e2b");
      return new E2BSandbox({ id: `wizards-${runId}`, template: "engenty-sandbox" });
    }),
};
```

A Mastra provider depends on `@mastra/core` as a peer; npm installs a copy of it into the
engine's folder. The adapter only calls the provider's methods, so the second copy does no harm,
but it is most of the size: `@mastra/e2b` 0.14.1 makes a folder of 172 MB, 90 MB of it Mastra
(tried 2026-10-17: it loads from there, and without `E2B_API_KEY` it says so when it starts).
Linking the runtime's own `@mastra/core` into the folder would save that; not done yet.
E2B's own cloud keeps data in the US; for the EU it runs self-hosted or in our own cloud account,
so it would be an engine people choose, never the default.

## What the spike found (Linux x64, 2026-10-17)

| | Result |
|---|---|
| Install | 485 MB as npm installs it; 346 MB after the installer drops `googleapis`, the AWS SDK and `better-sqlite3`, which the core never imports. About 20 s |
| Start | A VM in about 160 ms. The helper process takes about 330 MB, each VM 10–20 MB more; 5 VMs after Python about 640 MB, one VM with pandas loaded about 880 MB |
| Shell | bash and about 120 coreutils commands, sed, grep, gawk, find, diff, tar, gzip |
| Extra programs | curl, git, jq, sqlite3, zip and unzip ship with the core as WebAssembly but are off the PATH. The `@agentos-software/*` packages (0.3.3) are in a format 0.4 refuses. The installer packs the core's own binaries into a package folder; its files need mode 755 |
| Node | `node`, `npm`, `npx` (Node 22 API). `node file.ts` does not strip types; TypeScript runs only through agentOS's own API |
| Python | 3.13 as Pyodide, from the shell. numpy and pandas load offline. Other pure-Python packages install with `micropip` (`python3 -c "import micropip; await micropip.install('x')"`) and stay for the run. No `pip` command. Pillow, matplotlib and scipy are listed but fail to load |
| Python's directory | Python starts in `$HOME`, not in the shell's directory. The engine puts a `python3` function before every command that passes `HOME=$PWD` |
| Network | `default: deny` with rules `dns://<host>` + `tcp://<host>:443` lets exactly those hosts through; `dns://*.example.com` works too. Loopback (127.0.0.1) and 169.254.169.254 are refused with `EACCES` |
| Timeouts | A command over its limit ends as `timed_out`; the VM keeps working |
| Logs | The helper prints a line on stderr for every V8 engine it keeps warm, several per command. The installer writes `sidecar.sh`, which filters them; `AGENTOS_SIDECAR_BIN` points agentOS to it |

Not checked: installing from PyPI and npm inside the VM (the spike's container had no DNS of
its own), macOS, and how the VM behaves with real agent steps over hours.

## What runs where

| Engine | Where | Runs |
|---|---|---|
| `docker` | the host's Docker, one container per run | everything in the `engenty-sandbox` image, native programs included |
| `agentos` | the helper process beside the runtime, one VM per run | the table above: calculations, tables, file conversion, data from APIs |
| `off` | | no shell/code tool |

Unset, `SANDBOX` is `docker` when the image is on the machine, else `agentos` when it is
installed, else `off`. Video, PDFs and the browser don't need the sandbox: the runtime does them
with its own tools.

## The cloud

The image built with `SANDBOX_ENGINES=agentos` carries agentOS in `/opt/engines/agentos`; it
stays off until
`SANDBOX_ENABLED=1` and `SANDBOX=agentos`. `compose.cloud.yaml` keeps it off for now. Two things
first:

- **Where it runs.** In the runner's container agentOS would sit beside the tenant databases
  under `/data`. Its isolation is WebAssembly and V8, not a kernel. Safer: its own container
  behind a small API (exec, read, write, destroy), reached like the browser container.
- **What it costs.** About 330 MB per runner, plus the VMs; pandas makes one VM about 550 MB
  bigger. The runner needs a limit on parallel sandboxes.

## Later

- A full Linux engine for the wizards that need native programs (ffmpeg, ImageMagick,
  LibreOffice in the sandbox): MicroVMs on a NixOS host, behind the same API.
- agentOS 0.4 has a terminal, `software.install` from a URL and filesystem mounts; none is
  used yet.
