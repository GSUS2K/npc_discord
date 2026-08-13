FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.5.3 --activate && pnpm install --frozen-lockfile
COPY tsconfig.json eslint.config.mjs .prettierrc ./
COPY src ./src
RUN pnpm run build && pnpm prune --prod

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system npc && useradd --system --gid npc --home-dir /app npc
COPY --from=build --chown=npc:npc /app/node_modules ./node_modules
COPY --from=build --chown=npc:npc /app/dist ./dist
COPY --from=build --chown=npc:npc /app/src/database/schema.sql ./src/database/schema.sql
COPY --from=build --chown=npc:npc /app/package.json ./package.json
RUN mkdir -p /app/data && chown npc:npc /app/data
USER npc
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "dist/index.js"]
