import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LanguageModel } from "ai";
import { describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "wizards-device-"));
process.env.DATA_DIR = dir;
process.env.APP_URL = "http://localhost:5181";

type V3 = Extract<LanguageModel, { specificationVersion: "v3" }>;
type Options = Parameters<V3["doGenerate"]>[0];

/** The runtime's own model: answers "own" and counts its calls. */
function ownModel() {
  const calls: Options[] = [];
  const model: V3 = {
    specificationVersion: "v3",
    provider: "test",
    modelId: "own",
    supportedUrls: {},
    async doGenerate(options) {
      calls.push(options);
      return {
        content: [{ type: "text", text: "own" }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
          raw: {},
        },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error("not streamed in this test");
    },
  };
  return { model, calls };
}

const prompt = (text: string): Options["prompt"] => [
  { role: "system", content: "Be brief." },
  { role: "user", content: [{ type: "text", text }] },
];

describe("the device a run is watched from as a model", () => {
  it("is asked only while it offers the class, and forgotten when it offers nothing", async () => {
    const { offerDevice, deviceThinks } = await import("../src/engine/device");
    offerDevice("r1", { think: { classes: ["classifier"], maxChars: 1000 } });
    expect(deviceThinks("r1", "classifier")).toEqual({ maxChars: 1000 });
    expect(deviceThinks("r1", "standard")).toBeNull();
    expect(deviceThinks("r2", "classifier")).toBeNull();
    offerDevice("r1", {});
    expect(deviceThinks("r1", "classifier")).toBeNull();
  });

  it("answers from the device over the run's stream, and parses JSON for a schema", async () => {
    const { DeviceModel, answerDevice } = await import("../src/engine/device");
    const { subscribe } = await import("../src/engine/events");
    const own = ownModel();
    const seen: unknown[] = [];
    const unsubscribe = subscribe("r3", (signal) => {
      if (signal.device) {
        seen.push(signal.device);
        // The phone answers as the runner would: by id, a moment later.
        setTimeout(() => answerDevice("r3", signal.device!.id, { text: '{"yes": true}' }), 5);
      }
    });
    try {
      const model = new DeviceModel("r3", own.model, 5000, 2000);
      const result = await model.doGenerate({
        prompt: prompt("Is water wet?"),
        responseFormat: { type: "json", schema: { type: "object" } },
      });
      expect(result.content).toEqual([{ type: "text", text: '{"yes":true}' }]);
      expect(result.providerMetadata).toEqual({ device: { answered: true } });
      expect(own.calls).toHaveLength(0);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        kind: "think",
        system: "Be brief.",
        prompt: "Is water wet?",
        schema: { type: "object" },
      });
    } finally {
      unsubscribe();
    }
  });

  it("thinks on its own when the device does not answer in time, errs, or cannot take the call", async () => {
    const { DeviceModel, answerDevice } = await import("../src/engine/device");
    const { subscribe } = await import("../src/engine/events");
    const own = ownModel();
    // No one answers: the timeout hands the call to the own model.
    const silent = new DeviceModel("r4", own.model, 5000, 30);
    expect((await silent.doGenerate({ prompt: prompt("Hi") })).content).toEqual([
      { type: "text", text: "own" },
    ]);
    expect(own.calls).toHaveLength(1);
    // The phone says it cannot.
    const unsubscribe = subscribe("r5", (signal) => {
      if (signal.device) {
        answerDevice("r5", signal.device.id, { error: "guardrail" });
      }
    });
    try {
      const failing = new DeviceModel("r5", own.model, 5000, 2000);
      expect((await failing.doGenerate({ prompt: prompt("Hi") })).content).toEqual([
        { type: "text", text: "own" },
      ]);
      expect(own.calls).toHaveLength(2);
    } finally {
      unsubscribe();
    }
    // Too long for the phone, or with tools: never asked.
    const asked: unknown[] = [];
    const watch = subscribe("r6", (signal) => signal.device && asked.push(signal.device));
    try {
      const small = new DeviceModel("r6", own.model, 20, 2000);
      await small.doGenerate({ prompt: prompt("A prompt longer than twenty characters") });
      await small.doGenerate({
        prompt: prompt("Hi"),
        tools: [{ type: "function", name: "t", inputSchema: { type: "object" } }],
      });
      expect(asked).toHaveLength(0);
      expect(own.calls).toHaveLength(4);
    } finally {
      watch();
    }
  });

  it("takes an answer only for the call it belongs to", async () => {
    const { answerDevice } = await import("../src/engine/device");
    expect(answerDevice("r7", "unknown", { text: "x" })).toBe(false);
  });
});
