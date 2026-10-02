import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiPort = Number(process.env.API_PORT ?? 8891);

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./web/src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
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
  build: { outDir: "../dist-web", emptyOutDir: true },
});
