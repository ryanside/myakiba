# Build stage - handle workspace context
FROM oven/bun:1.2.19-alpine AS build

WORKDIR /app

# Copy workspace package files for proper dependency resolution
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Install all dependencies (needed for workspace resolution)
RUN bun install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Dependencies stage - install only production deps
FROM oven/bun:1.2.19-alpine AS deps

WORKDIR /app

# Copy package files (including workspace packages to satisfy Bun workspaces)
COPY package.json bun.lock ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Install only production dependencies
RUN bun install --omit=dev --no-cache

# Our application runner
FROM oven/bun:1.2.19-alpine AS runner

ENV NODE_ENV=production

WORKDIR /app

# Copy worker source code and config
COPY --from=build /app/apps/worker/index.ts ./index.ts
COPY --from=build /app/apps/worker/worker.ts ./worker.ts
COPY --from=build /app/apps/worker/tsconfig.json ./tsconfig.json
COPY --from=build /app/apps/worker/db ./db
COPY --from=build /app/apps/worker/lib ./lib

# Copy only production node_modules
COPY --from=deps /app/node_modules ./node_modules

# Remove unnecessary files from node_modules to reduce size
RUN find ./node_modules -name "*.md" -delete && \
    find ./node_modules -name "*.ts" -not -name "*.d.ts" -delete && \
    find ./node_modules -name "test" -type d -prune -exec rm -rf {} + && \
    find ./node_modules -name "tests" -type d -prune -exec rm -rf {} + && \
    find ./node_modules -name "*.map" -delete

ENTRYPOINT ["bun", "run", "index.ts"]