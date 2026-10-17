# agentOS as the sandbox without Docker

Decided 2026-10-17 after a spike with agentOS 0.4.1. Built the same day: the engine
(`apps/runtime/src/sandbox/agentos.ts`), its installer (`agentos-install.ts`), `wizards sandbox`,
and the image's `AGENTOS` build argument.

## Why it came back

#32 (2026-10-15) dropped agentOS 0.2.22: it added about 1.75 GB on Linux, most of it
four coding agents nobody here uses (Pi, Claude Code, Codex, opencode). agentOS 0.4.1
(2026-10-12) no longer depends on them, and it runs a lot more than 0.2.22 did.

It stays out of `package.json`. `wizards sandbox add`, `pnpm sandbox:add` or the image's
`AGENTOS=1` install it into a folder of its own (`AGENTOS_DIR`), and the engine loads it from
there with `import()`. A computer without it gets no sandbox, as before.

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

The image built with `AGENTOS=1` carries agentOS in `/opt/agentos`; it stays off until
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
