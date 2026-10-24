FROM oven/bun:1.4.4-debian AS base

FROM base AS prune
RUN bun add -g turbo@2.10.11
WORKDIR /app
COPY . .
RUN turbo prune @myakiba/db --docker

FROM base AS install
WORKDIR /app
COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile --ignore-scripts --production --linker=hoisted

FROM base
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY --from=prune /app/out/full/ .

WORKDIR /app/packages/db
CMD ["bun", "run", "db:push"]
