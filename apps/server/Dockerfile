# ---- Base ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --prod=false

# ---- Build ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @auto-linked/shared build
RUN pnpm --filter @auto-linked/server build

# ---- Production ----
FROM base AS production
ENV NODE_ENV=production
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/server/node_modules apps/server/node_modules
COPY --from=deps /app/packages/shared/node_modules packages/shared/node_modules
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/drizzle apps/server/drizzle
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY pnpm-workspace.yaml package.json ./

EXPOSE 4000
WORKDIR /app/apps/server
CMD ["node", "dist/server.js"]
