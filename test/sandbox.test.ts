import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pythonToolDescription, shellToolDescription } from "../server/sandbox";
import { AGENTOS_CAPABILITIES, AgentOsSandbox, stopAgentOs } from "../server/sandbox/agentos";
import { DOCKER_CAPABILITIES, DockerRunSandbox } from "../server/sandbox/docker";
import type { Sandbox } from "../server/sandbox/types";

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("utf8");

/** agentOS ships its sidecar for these hosts only. */
const agentOsHost =
  ["darwin", "linux"].includes(process.platform) && ["arm64", "x64"].includes(process.arch);

function dockerImage(): string | null {
  const image = process.env.SANDBOX_IMAGE || "engenty-sandbox:latest";
  try {
    execFileSync("docker", ["image", "inspect", image], { stdio: "ignore", timeout: 10_000 });
    return image;
  } catch {
    return null;
  }
}

describe("tool descriptions", () => {
  it("promise what the engine runs", () => {
    expect(shellToolDescription(DOCKER_CAPABILITIES)).toContain("python3");
    expect(shellToolDescription(DOCKER_CAPABILITIES)).not.toContain("run_python");
    expect(shellToolDescription(AGENTOS_CAPABILITIES)).not.toContain("python3");
    expect(shellToolDescription(AGENTOS_CAPABILITIES)).toContain("use run_python");
    expect(pythonToolDescription(AGENTOS_CAPABILITIES)).toContain("numpy");
  });
});

describe.skipIf(!agentOsHost)("agentOS sandbox", () => {
  let sandbox: Sandbox;
  let host: Server;
  let hostUrl: string;

  beforeAll(async () => {
    host = createServer((_, res) => res.end("host-only")).listen(0, "127.0.0.1");
    await new Promise((resolve) => host.once("listening", resolve));
    hostUrl = `http://127.0.0.1:${(host.address() as AddressInfo).port}/`;
    process.env.SANDBOX_TEST_SECRET = "host-secret";
    sandbox = new AgentOsSandbox();
  });

  afterAll(async () => {
    await sandbox.destroy();
    await stopAgentOs();
    host.close();
  }, 60_000);

  it("runs a shell command in its working directory", async () => {
    const result = await sandbox.exec(
      "pwd && printf 'b\\na\\n' > list.txt && sort list.txt | head -1 && echo $GREETING",
      { env: { GREETING: "hallo" } },
    );
    expect(result).toEqual({ exitCode: 0, stdout: "/workspace\na\nhallo\n", stderr: "" });
  }, 120_000);

  it("runs every command it promises", async () => {
    const result = await sandbox.exec(`which ${AGENTOS_CAPABILITIES.commands.join(" ")}`);
    expect(result.stdout.trim().split("\n")).toHaveLength(AGENTOS_CAPABILITIES.commands.length);
    expect(result.exitCode).toBe(0);
    const node = await sandbox.exec("node -e 'console.log(6 * 7)'");
    expect(node.stdout).toBe("42\n");
  }, 120_000);

  it("runs Python and shares its files with the shell and the host", async () => {
    const python = await sandbox.runPython!(
      "import json\nopen('out.json', 'w').write(json.dumps({'sum': sum(range(5))}))\nprint('done')",
    );
    expect(python).toEqual({ exitCode: 0, stdout: "done\n", stderr: "" });
    expect((await sandbox.exec("cat out.json")).stdout).toBe('{"sum": 10}');
    expect(text(await sandbox.readFile("out.json"))).toBe('{"sum": 10}');

    const failed = await sandbox.runPython!("x = 1\nraise ValueError('boom')");
    expect(failed.exitCode).toBe(1);
    expect(failed.stderr).toMatch(/^PythonError: Traceback[\s\S]*ValueError: boom\n$/);

    await sandbox.writeFile("in/data.csv", "a,b\n1,2\n");
    expect((await sandbox.exec("wc -l < in/data.csv")).stdout.trim()).toBe("2");
    await expect(sandbox.readFile("missing.txt")).rejects.toThrow();
  }, 180_000);

  it("refuses python in the shell, where it would hang", async () => {
    const result = await sandbox.exec("cd /tmp && python3 -c 'print(1)'");
    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain("run_python");
  });

  it("kills a command that outlives its timeout", async () => {
    const result = await sandbox.exec("while true; do :; done", { timeoutMs: 3000 });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("timed out");
    expect((await sandbox.exec("echo alive")).stdout).toBe("alive\n");
  }, 120_000);

  it("sees neither the host's files and environment nor its loopback", async () => {
    const files = await sandbox.exec(`ls ${process.cwd()} /Users; echo "[$SANDBOX_TEST_SECRET]"`);
    expect(files.stdout).toBe("[]\n");
    expect((await sandbox.exec("env")).stdout).not.toContain("host-secret");

    const fromNode = await sandbox.exec(
      `node -e 'fetch("${hostUrl}").then(async (r) => console.log("reached", await r.text()), (e) => console.log("blocked", e.cause?.code))'`,
    );
    expect(fromNode.stdout).toBe("blocked EACCES\n");
    const fromPython = await sandbox.runPython!(
      `import urllib.request\ntry:\n    print("reached", urllib.request.urlopen("${hostUrl}", timeout=5).read())\nexcept Exception as err:\n    print("blocked", type(err).__name__)`,
    );
    expect(fromPython.stdout).toBe("blocked PermissionError\n");
  }, 180_000);
});

const image = dockerImage();

describe.skipIf(!image)("Docker sandbox", () => {
  const sandbox = new DockerRunSandbox(`test${Date.now()}`, image ?? "");

  afterAll(() => sandbox.destroy(), 60_000);

  it("runs shell and Python and moves files in and out", async () => {
    const which = await sandbox.exec(`which ${DOCKER_CAPABILITIES.commands.join(" ")}`);
    expect(which.exitCode).toBe(0);

    const python = await sandbox.exec(
      `python3 -c "open('out.txt', 'w').write('from python'); print(6 * 7)"`,
    );
    expect(python).toMatchObject({ exitCode: 0, stdout: "42\n" });
    expect(text(await sandbox.readFile("out.txt"))).toBe("from python");

    const big = "zeile 'eins'\n".repeat(20_000);
    await sandbox.writeFile("in/big.txt", big);
    expect((await sandbox.exec("wc -c < in/big.txt")).stdout.trim()).toBe(String(big.length));
    await expect(sandbox.readFile("missing.txt")).rejects.toThrow();
  }, 180_000);
});
