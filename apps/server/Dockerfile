FROM oven/bun:1.3-debian AS base

# Prune stage - generate a minimal workspace for server (includes web via dependency)
FROM base AS prune
RUN bun add -g turbo
WORKDIR /app
COPY . .
RUN turbo prune server --docker

# Install stage - install only the dependencies needed for server + web
FROM base AS install
WORKDIR /app
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --ignore-scripts

# Build stage - compile the application
FROM base AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY --from=prune /app/out/full/ .

# Build the frontend
ARG SOURCE_COMMIT
ENV VITE_BUILD_ID=${SOURCE_COMMIT:-dev}
WORKDIR /app/apps/web
RUN bun run build

# Build the server
WORKDIR /app
RUN bun build --compile --minify --sourcemap ./apps/server/src/index.ts --outfile server

# Our application runner
FROM gcr.io/distroless/base-debian12:nonroot AS runner

# Copy busybox as wget for health checks
# (busybox uses argv[0] to determine which applet to run)
COPY --from=busybox:1.36-musl /bin/busybox /usr/bin/wget

ENV NODE_ENV=production

ARG SOURCE_COMMIT
ENV BUILD_ID=${SOURCE_COMMIT:-dev}

ARG BUILD_APP_PORT=3000
ENV APP_PORT=${BUILD_APP_PORT}
EXPOSE ${APP_PORT}

WORKDIR /app

COPY --from=build /app/server .
COPY --from=build /app/apps/server/dist ./dist

ENTRYPOINT ["./server"]
