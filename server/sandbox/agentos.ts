import { posix } from "node:path";
import type { AgentOs, AgentOsSidecar, CodeExecutionResult } from "@rivet-dev/agentos-core";
import type {
  ExecOptions,
  ExecResult,
  PythonOptions,
  Sandbox,
  SandboxCapabilities,
} from "./types.js";

const WORKDIR = "/workspace";
const EXEC_TIMEOUT_MS = 120_000;
const INSTALL_TIMEOUT_MS = 300_000;
/** The only hosts the VM reaches: where npm and Python packages come from. */
const REGISTRIES = ["registry.npmjs.org", "pypi.org", "files.pythonhosted.org"];
/** python at the start of a command, after an operator, or behind VAR=value assignments. */
const PYTHON_IN_SHELL = /(?:^|[;&|(\n`]|\$\()\s*(?:\w+=\S*\s+)*python3?(?:\.\d+)?(?=\s|$)/;

/**
 * What an agentOS VM runs: a WASM userland (a POSIX shell and coreutils, no native binaries),
 * Node in a V8 isolate and Python as Pyodide. Python started from the shell never returns, so
 * it is offered as its own tool; of the compiled wheels only numpy loads reliably.
 */
export const AGENTOS_CAPABILITIES: SandboxCapabilities = {
  commands: [
    "sh",
    "ls",
    "cat",
    "head",
    "tail",
    "sort",
    "wc",
    "grep",
    "sed",
    "awk",
    "find",
    "diff",
    "tar",
    "gzip",
    "base64",
    "node",
    "npm",
  ],
  python: "tool",
  pythonPackages:
    "Python 3.13 standard library; `packages` installs numpy and pure-Python packages from PyPI such as openpyxl or pypdf — no pandas, pillow or matplotlib",
  network: "none, except the npm and PyPI registries",
  uses: "calculations or file conversion",
  workdir: WORKDIR,
};

interface Runtime {
  AgentOs: typeof AgentOs;
  sidecar: AgentOsSidecar;
}

let runtime: Promise<Runtime> | null = null;

/** One native sidecar process hosts the VM of every run; the first sandbox starts it. */
function agentOsRuntime(): Promise<Runtime> {
  runtime ??= (async () => {
    const [core, runtimeCore] = await Promise.all([
      import("@rivet-dev/agentos-core"),
      import("@rivet-dev/agentos-runtime-core"),
    ]).catch((err) => {
      throw new Error(
        `SANDBOX=agentos needs @rivet-dev/agentos-core in this build: ${err.message}`,
      );
    });
    keepRuntimeCommands(runtimeCore.SidecarProcess);
    return { AgentOs: core.AgentOs, sidecar: await core.AgentOs.createSidecar() };
  })().catch((err) => {
    runtime = null;
    throw err;
  });
  return runtime;
}

const patched = new WeakSet<object>();

/**
 * agentOS registers `python` as a kernel command when it creates a VM and leaves it out when
 * it configures that VM; naming the runtime commands there again is what makes Python start.
 */
function keepRuntimeCommands(SidecarProcess: { prototype: any }) {
  const proto = SidecarProcess.prototype;
  if (patched.has(proto)) {
    return;
  }
  patched.add(proto);
  const configureVm = proto.configureVm;
  proto.configureVm = function (session: unknown, vm: unknown, options: any) {
    const commands = [
      "node",
      "npm",
      "npx",
      "python",
      "python3",
      ...(options?.bootstrapCommands ?? []),
    ];
    return configureVm.call(this, session, vm, {
      ...options,
      bootstrapCommands: [...new Set(commands)],
    });
  };
}

/** Stops the sidecar process. The next sandbox starts a new one. */
export async function stopAgentOs(): Promise<void> {
  const current = runtime;
  runtime = null;
  await (await current?.catch(() => null))?.sidecar.dispose();
}

function toResult(result: CodeExecutionResult, python = false): ExecResult {
  const stdout = result.stdout ?? "";
  let stderr = result.stderr ?? "";
  if (python) {
    // A Python traceback arrives with the interpreter's own JavaScript stack behind it.
    stderr = stderr.replace(/\n\s+at [\s\S]*$/, "\n");
  }
  if (result.outcome === "timed_out") {
    stderr = `${stderr}\ntimed out`.trim();
  } else if (result.outcome !== "succeeded" && !stdout && !stderr) {
    stderr = result.error.message;
  }
  return { exitCode: result.exitCode ?? (result.outcome === "succeeded" ? 0 : 1), stdout, stderr };
}

/** One agentOS VM per run, inside the server process's sidecar: no Docker, no container. */
export class AgentOsSandbox implements Sandbox {
  readonly capabilities = AGENTOS_CAPABILITIES;
  private machine: Promise<AgentOs> | null = null;
  private readonly installed = new Set<string>();

  private vm(): Promise<AgentOs> {
    this.machine ??= (async () => {
      const { AgentOs, sidecar } = await agentOsRuntime();
      return AgentOs.create({
        sidecar: { kind: "explicit", handle: sidecar },
        // Anything not listed is refused, the host's own loopback included.
        permissions: {
          fs: "allow",
          childProcess: "allow",
          process: "allow",
          env: "allow",
          network: {
            default: "deny",
            rules: [
              {
                mode: "allow",
                operations: ["*"],
                patterns: REGISTRIES.flatMap((host) => [`dns://${host}`, `tcp://${host}:443`]),
              },
            ],
          },
        },
      });
    })();
    return this.machine;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    if (PYTHON_IN_SHELL.test(command)) {
      return {
        exitCode: 127,
        stdout: "",
        stderr: "python is not a shell command in this sandbox; run Python with run_python.",
      };
    }
    const vm = await this.vm();
    return toResult(
      await vm.process.exec(command, {
        cwd: options.cwd ?? WORKDIR,
        env: options.env,
        timeoutMs: options.timeoutMs ?? EXEC_TIMEOUT_MS,
        output: { capture: "all" },
      }),
    );
  }

  async runPython(source: string, options: PythonOptions = {}): Promise<ExecResult> {
    const vm = await this.vm();
    const missing = (options.packages ?? []).filter((name) => !this.installed.has(name));
    if (missing.length) {
      const install = toResult(
        await vm.python.install(missing, {
          timeoutMs: INSTALL_TIMEOUT_MS,
          output: { capture: "all" },
        }),
      );
      // A wheel that is listed but not shipped "installs" and then fails to load.
      if (install.exitCode !== 0 || /Failed to load/.test(install.stdout)) {
        return { ...install, exitCode: install.exitCode || 1 };
      }
      for (const name of missing) {
        this.installed.add(name);
      }
    }
    return toResult(
      await vm.python.execute(source, {
        // Python starts in its HOME whatever cwd says, and only /workspace is shared with the shell.
        env: { ...options.env, HOME: WORKDIR },
        timeoutMs: options.timeoutMs ?? EXEC_TIMEOUT_MS,
        output: { capture: "all" },
      }),
      true,
    );
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const vm = await this.vm();
    const target = posix.resolve(WORKDIR, path);
    await vm.filesystem.mkdir(posix.dirname(target), { recursive: true });
    await vm.filesystem.writeFile(target, data);
  }

  async readFile(path: string): Promise<Uint8Array> {
    const vm = await this.vm();
    return vm.filesystem.readFile(posix.resolve(WORKDIR, path));
  }

  async destroy(): Promise<void> {
    const machine = this.machine;
    this.machine = null;
    await (await machine?.catch(() => null))?.dispose();
  }
}
