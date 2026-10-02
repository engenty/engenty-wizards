import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defaultClientConditions, defineConfig } from "vite";

const apiPort = Number(process.env.API_PORT ?? 8891);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    // "wizards-source": the shared package is read as TypeScript, so the web app needs no build of it.
    conditions: ["wizards-source", ...defaultClientConditions],
  },
  server: {
    port: Number(process.env.PORT ?? 5181),
    strictPort: true,
    allowedHosts: true,
    proxy: {
      "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false, xfwd: true },
      "/.well-known": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false, xfwd: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
