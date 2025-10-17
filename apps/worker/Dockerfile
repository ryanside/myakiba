# Build stage
FROM oven/bun:1.2-debian AS build

WORKDIR /app

# Copy dependencies
COPY bun.lock package.json ./
COPY /apps/server/package.json ./apps/server/package.json
COPY /apps/web/package.json ./apps/web/package.json
COPY /apps/worker/package.json ./apps/worker/package.json
COPY /packages/eslint-config/package.json ./packages/eslint-config/package.json

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application
COPY . .

# Build the worker
WORKDIR /app

# Remove workspace node_modules symlinks to force resolution from root
RUN rm -rf apps/server/node_modules apps/web/node_modules apps/worker/node_modules

RUN bun build --compile --minify --sourcemap --packages bundle ./apps/worker/index.ts --outfile worker

# Our application runner
FROM gcr.io/distroless/base-debian12:nonroot AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/worker .

ENTRYPOINT ["./worker"]