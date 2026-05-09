FROM node:22-alpine AS base
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json tsconfig.json ./

# Copy package manifests for all workspace members
COPY lib/db/package.json ./lib/db/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY artifacts/server/package.json ./artifacts/server/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY lib/db/src ./lib/db/src
COPY lib/db/drizzle.config.ts ./lib/db/
COPY lib/api-zod/src ./lib/api-zod/src
COPY artifacts/server/src ./artifacts/server/src

WORKDIR /app/artifacts/server

EXPOSE 3000

ENV NODE_ENV=production

CMD ["pnpm", "start"]
