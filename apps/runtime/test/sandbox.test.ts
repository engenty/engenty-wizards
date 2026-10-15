import { execFileSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { shellToolDescription } from "../src/sandbox";
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
  });
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
