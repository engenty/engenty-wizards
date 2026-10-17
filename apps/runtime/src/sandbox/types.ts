export interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** What an engine really runs. The agent's tool descriptions are written from this. */
export interface SandboxCapabilities {
  /** Programs the shell finds on its PATH. */
  commands: readonly string[];
  /** What the sandbox reaches over the network, as told to the agent. */
  network: string;
  /** What else the agent must know to use it, such as how Python packages get in. */
  notes?: string;
  /** What the sandbox is good for, as told to whoever authors a wizard. */
  uses: string;
  workdir: string;
}

/** The private machine of one run: made on the first tool call, destroyed when the run stops. */
export interface Sandbox {
  readonly capabilities: SandboxCapabilities;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  /** Relative paths are taken from the working directory. */
  writeFile(path: string, data: string | Uint8Array): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  destroy(): Promise<void>;
}
