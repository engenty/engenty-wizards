import { env } from "../env.js";
import { AGENTOS_CAPABILITIES, AgentOsSandbox } from "./agentos.js";
import { DOCKER_CAPABILITIES, DockerRunSandbox } from "./docker.js";
import type { Sandbox, SandboxCapabilities } from "./types.js";

export type {
  ExecOptions,
  ExecResult,
  PythonOptions,
  Sandbox,
  SandboxCapabilities,
} from "./types.js";

/** What this server's sandbox runs, or null when it is switched off. */
export function sandboxCapabilities(): SandboxCapabilities | null {
  if (env.sandbox === "off") {
    return null;
  }
  return env.sandbox === "agentos" ? AGENTOS_CAPABILITIES : DOCKER_CAPABILITIES;
}

export function createSandbox(runId: string): Sandbox {
  if (env.sandbox === "off") {
    throw new Error("The sandbox is switched off on this server.");
  }
  return env.sandbox === "agentos"
    ? new AgentOsSandbox()
    : new DockerRunSandbox(runId, env.sandboxImage);
}

export function shellToolDescription(caps: SandboxCapabilities): string {
  const python =
    caps.python === "tool" ? " Python is not a shell command here: use run_python." : "";
  return `Run a shell command in a private Linux sandbox (${caps.commands.join(", ")}). Working directory ${caps.workdir}. Network: ${caps.network}.${python}`;
}

export function pythonToolDescription(caps: SandboxCapabilities): string {
  return `Run Python code in the sandbox (${caps.pythonPackages}). Working directory ${caps.workdir}, shared with run_command and export_file.`;
}

/** The authoring guide's line about the sandbox tool. */
export function sandboxGuideLine(): string {
  const uses = (sandboxCapabilities() ?? DOCKER_CAPABILITIES).uses;
  return `- The sandbox runs code (python/node) for ${uses}; export_file hands files to the person.`;
}
