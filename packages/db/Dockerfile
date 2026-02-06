FROM oven/bun:1.3-debian AS base

# Prune stage - generate a minimal workspace for @myakiba/db
FROM base AS prune
RUN bun add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune @myakiba/db --docker

# Install stage - install only the dependencies needed for db
FROM base AS install
WORKDIR /app
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --ignore-scripts

# Runtime stage - copy full source and run db:push
FROM base
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY --from=prune /app/out/full/ .

WORKDIR /app/packages/db
CMD ["bun", "run", "db:push:force"]
