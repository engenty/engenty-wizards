import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shellToolDescription } from "../src/sandbox";
import { AgentOsSandbox, agentOsCapabilities, stopAgentOs } from "../src/sandbox/agentos";
import { agentOsVersion, defaultAgentOsDir } from "../src/sandbox/agentos-install";
import { DOCKER_CAPABILITIES, DockerRunSandbox } from "../src/sandbox/docker";

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("utf8");

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
    const agentOs = shellToolDescription(agentOsCapabilities());
    expect(agentOs).toContain("python3");
    expect(agentOs).toContain("micropip");
    expect(agentOs).toContain("none, except the npm and PyPI registries");
    expect(shellToolDescription(agentOsCapabilities(["api.example.com"]))).toContain(
      "only the npm and PyPI registries and api.example.com",
    );
  });
});

/** Installed with `wizards sandbox add`, or `node …/agentos-install.js` with AGENTOS_DIR. */
const agentOsDir = process.env.AGENTOS_DIR || defaultAgentOsDir();

describe.skipIf(!agentOsVersion(agentOsDir))("agentOS sandbox", () => {
  let sandbox: AgentOsSandbox;
  let host: Server;
  let hostUrl: string;

  beforeAll(async () => {
    host = createServer((_, res) => res.end("host-only")).listen(0, "127.0.0.1");
    await new Promise((resolve) => host.once("listening", resolve));
    hostUrl = `http://127.0.0.1:${(host.address() as AddressInfo).port}/`;
    process.env.SANDBOX_TEST_SECRET = "host-secret";
    sandbox = new AgentOsSandbox(agentOsDir, []);
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
    const result = await sandbox.exec(`which ${sandbox.capabilities.commands.join(" ")}`);
    expect(result.stdout.trim().split("\n")).toHaveLength(sandbox.capabilities.commands.length);
    expect(result.exitCode).toBe(0);
    expect((await sandbox.exec("node -e 'console.log(6 * 7)'")).stdout).toBe("42\n");
    expect((await sandbox.exec(`echo '{"a":[1,2,3]}' | jq '.a | add'`)).stdout).toBe("6\n");
    expect((await sandbox.exec("sqlite3 :memory: 'select 6 * 7'")).stdout).toBe("42\n");
  }, 120_000);

  it("runs Python from the shell and shares its files with the host", async () => {
    await sandbox.writeFile("in/data.csv", "a,b\n1,2\n3,4\n");
    const python = await sandbox.exec(
      `cd in && python3 -c "import pandas; d = pandas.read_csv('data.csv'); open('../out.txt', 'w').write(str(d.b.sum())); print('done')"`,
    );
    expect(python).toMatchObject({ exitCode: 0, stdout: "done\n" });
    expect(text(await sandbox.readFile("out.txt"))).toBe("6");

    const failed = await sandbox.exec("python3 -c \"raise ValueError('boom')\"");
    expect(failed.exitCode).not.toBe(0);
    expect(failed.stderr).toContain("ValueError: boom");
    await expect(sandbox.readFile("missing.txt")).rejects.toThrow();
  }, 180_000);

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
    const fromCurl = await sandbox.exec(`curl -sS -m 5 ${hostUrl}`);
    expect(fromCurl.exitCode).not.toBe(0);
    expect(fromCurl.stdout).not.toContain("host-only");
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
