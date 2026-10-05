import { renameSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * The flow widget AI apps show (MCP Apps): one HTML file with its script and styles inline, as
 * the hosts load it from the MCP server's resource. Built after the app into `dist/mcp/flow.html`.
 */
const outDir = fileURLToPath(new URL("./dist/mcp", import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
    {
      name: "flow-html",
      closeBundle() {
        renameSync(`${outDir}/mcp-app.html`, `${outDir}/flow.html`);
      },
    },
  ],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify("mcp-app"),
    "import.meta.env.VITE_APP_BASE": JSON.stringify(""),
  },
  // The app's public files are the app's; the widget is the one file.
  publicDir: false,
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    conditions: ["wizards-source", ...defaultClientConditions],
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./mcp-app.html", import.meta.url)) },
  },
});
