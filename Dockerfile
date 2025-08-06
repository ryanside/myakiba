# Build stage
FROM oven/bun:1.2-debian AS build

WORKDIR /app

# Copy dependencies
COPY bun.lock package.json ./
COPY /apps/server/package.json ./apps/server/package.json
COPY /apps/web/package.json ./apps/web/package.json
COPY /apps/worker/package.json ./apps/worker/package.json

# Build dependencies (including devDependencies for build process)
RUN bun install --verbose

# Copy source and compile
COPY . .

# Build the frontend
WORKDIR /app/apps/web
RUN bun run build

# Build the server
WORKDIR /app/apps/server
RUN bun build --compile --minify --sourcemap ./src --outfile server

# Our application runner
FROM gcr.io/distroless/base-debian12:nonroot AS runner

ENV NODE_ENV=production

ARG BUILD_APP_PORT=3000
ENV APP_PORT=${BUILD_APP_PORT}
EXPOSE ${APP_PORT}

WORKDIR /app

# Copy the compiled executable from the build stage
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/server .

ENTRYPOINT ["./server"]