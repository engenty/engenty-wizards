import { DockerSandbox } from "@mastra/docker";
import type { ExecOptions, ExecResult, Sandbox, SandboxCapabilities } from "./types.js";

/** The image's own working directory, the one its unprivileged user may write to. */
const WORKDIR = "/sandbox";
/** Bytes per append when a file is written through the shell; stays far below ARG_MAX. */
const WRITE_CHUNK = 48 * 1024;

/** What the engenty-sandbox image carries. The container sits on Docker's default bridge. */
export const DOCKER_CAPABILITIES: SandboxCapabilities = {
  commands: ["bash", "python3", "pip", "uv", "node", "npm", "bun", "jq", "curl", "git", "unzip"],
  python: "shell",
  pythonPackages: "install what you need with pip or uv",
  network: "open internet",
  uses: "calculations, charts or file conversion",
  workdir: WORKDIR,
};

const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/** One container per run through the host's Docker. */
export class DockerRunSandbox implements Sandbox {
  readonly capabilities = DOCKER_CAPABILITIES;
  private container: Promise<DockerSandbox> | null = null;

  constructor(
    private readonly runId: string,
    private readonly image: string,
  ) {}

  private start(): Promise<DockerSandbox> {
    this.container ??= (async () => {
      const sandbox = new DockerSandbox({
        id: `wizards-${this.runId.toLowerCase()}`,
        image: this.image,
        memory: 1024 * 1024 * 1024,
        pidsLimit: 256,
        capDrop: ["ALL"],
        securityOpt: ["no-new-privileges"],
        workingDir: WORKDIR,
        labels: { "engenty-wizards.run": this.runId },
      });
      await sandbox.start();
      return sandbox;
    })();
    return this.container;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const sandbox = await this.start();
    const result = await sandbox.executeCommand!(command, [], {
      timeout: options.timeoutMs,
      cwd: options.cwd,
      env: options.env,
    });
    return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
  }

  async writeFile(path: string, data: string | Uint8Array): Promise<void> {
    const target = quote(path);
    const bytes = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
    await this.must(`mkdir -p "$(dirname ${target})" && : > ${target}`);
    for (let at = 0; at < bytes.length; at += WRITE_CHUNK) {
      const chunk = bytes.subarray(at, at + WRITE_CHUNK).toString("base64");
      await this.must(`printf %s ${chunk} | base64 -d >> ${target}`);
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const result = await this.must(`base64 -w0 ${quote(path)}`);
    return Buffer.from(result.stdout.trim(), "base64");
  }

  private async must(command: string): Promise<ExecResult> {
    const result = await this.exec(command);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `exit code ${result.exitCode}`);
    }
    return result;
  }

  async destroy(): Promise<void> {
    const container = this.container;
    this.container = null;
    await (await container?.catch(() => null))?.destroy();
  }
}
