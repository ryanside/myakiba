# Build stage
FROM oven/bun:1.2.19-alpine AS build

WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY apps/worker/package.json ./apps/worker/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the frontend (outputs to apps/server/dist)
WORKDIR /app/apps/web
RUN bun run build

# Dependencies stage - install only production deps
FROM oven/bun:1.2.19-alpine AS deps

WORKDIR /app

# Copy package files (including workspace packages to satisfy Bun workspaces)
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# Install only production dependencies
RUN bun install --omit=dev --no-cache

# Our application runner
FROM oven/bun:1.2.19-alpine AS runner

ENV NODE_ENV=production

ARG BUILD_APP_PORT=3000
ENV APP_PORT=${BUILD_APP_PORT}
EXPOSE ${APP_PORT}

WORKDIR /app

# Copy the web build (static files)
COPY --from=build /app/apps/server/dist ./dist

# Copy the server source code and config
COPY --from=build /app/apps/server/src ./src
COPY --from=build /app/apps/server/tsconfig.json ./tsconfig.json
COPY --from=build /app/apps/server/drizzle.config.ts ./drizzle.config.ts

# Copy only production node_modules and clean up
COPY --from=deps /app/node_modules ./node_modules

# Remove unnecessary files from node_modules to reduce size
RUN find ./node_modules -name "*.md" -delete && \
    find ./node_modules -name "*.ts" -not -name "*.d.ts" -delete && \
    find ./node_modules -name "test" -type d -prune -exec rm -rf {} + && \
    find ./node_modules -name "tests" -type d -prune -exec rm -rf {} + && \
    find ./node_modules -name "*.map" -delete

ENTRYPOINT ["bun", "run", "src/index.ts"]