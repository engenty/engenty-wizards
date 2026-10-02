import { offlineContext } from "../render/chromium.js";

/**
 * Runs a model-written script over workspace files inside Chromium with no network: reshaping
 * downloaded data (simplify outlines, merge files, precompute paths) without passing it through
 * the model. `files` maps paths to text; the script's return value is the result.
 */
export async function runScript(
  script: string,
  files: Record<string, string>,
  timeoutMs = 20_000,
): Promise<unknown> {
  const context = await offlineContext();
  try {
    const page = await context.newPage();
    await page.setContent("<!doctype html><html><body></body></html>");
    const run = page.evaluate(
      async ({ script, files }) => {
        const fn = new Function("files", `return (async () => {\n${script}\n})();`);
        return await fn(files);
      },
      { script, files },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`The script ran longer than ${timeoutMs / 1000} seconds.`)),
        timeoutMs,
      );
    });
    try {
      return await Promise.race([run, timeout]);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    await context.close();
  }
}
