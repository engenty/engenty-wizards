# engenty wizards — one image: API + built SPA + headless Chromium for PDF/PNG and the browser tool.
# The build context is the repo root: docker build -f apps/runtime/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/runtime/package.json apps/runtime/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY . .
# The path the app is served under (https://engenty.ai/w: /w); empty at an origin's root.
ARG APP_BASE_PATH=""
ENV APP_BASE_PATH=$APP_BASE_PATH
RUN pnpm build
# Only what the runtime needs to run: its dependencies and the shared package's.
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --prod --frozen-lockfile --filter "@engenty-wizards/runtime..."

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
# The checkout's layout: the runtime finds the SPA (apps/web/dist) and the Claude Code plugin
# template (plugin/, filled with APP_URL at runtime) relative to its own files.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/runtime/package.json ./apps/runtime/
COPY --from=build /app/apps/runtime/node_modules ./apps/runtime/node_modules
COPY --from=build /app/apps/runtime/dist ./apps/runtime/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/plugin ./plugin
VOLUME /data
EXPOSE 8891
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:8891/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/runtime/dist/index.js"]
