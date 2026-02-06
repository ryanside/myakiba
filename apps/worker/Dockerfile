FROM oven/bun:1.3-debian AS base

# Prune stage - generate a minimal workspace for worker
FROM base AS prune
RUN bun add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune worker --docker

# Install stage - install only the dependencies needed for worker
FROM base AS install
WORKDIR /app
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --ignore-scripts --production --linker=hoisted

# Build stage - compile the worker binary
FROM base AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY --from=prune /app/out/full/ .

RUN bun build --compile --minify --sourcemap --packages bundle ./apps/worker/index.ts --outfile worker

# Our application runner
FROM gcr.io/distroless/base-debian12:nonroot AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/worker .

ENTRYPOINT ["./worker"]
