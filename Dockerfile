# engenty wizards — one image: API + built SPA + headless Chromium for PDF/PNG and the browser tool.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ffmpeg fonts-liberation fonts-noto-color-emoji fonts-inter ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    API_PORT=8891 \
    DATA_DIR=/data \
    CHROME_PATH=/usr/bin/chromium \
    SANDBOX_ENABLED=0
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist-web ./dist-web
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/server/db/migrations ./server/db/migrations
# The Claude Code plugin template, filled with APP_URL at runtime (server/plugin.ts).
COPY --from=build /app/plugin ./plugin
VOLUME /data
EXPOSE 8891
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8891/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/server/index.js"]
