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
RUN bun install --verbose --frozen-lockfile 

# Copy the rest of the application
COPY . .

# Build the frontend
WORKDIR /app/apps/web
RUN bun run build

# Build the server
WORKDIR /app

# Remove workspace node_modules symlinks to force resolution from root
RUN rm -rf apps/server/node_modules apps/web/node_modules apps/worker/node_modules

RUN bun build --compile --minify --sourcemap --packages bundle ./apps/server/src/index.ts --outfile server

# Our application runner
FROM gcr.io/distroless/base-debian12:nonroot AS runner

ENV NODE_ENV=production

ARG BUILD_APP_PORT=3000
ENV APP_PORT=${BUILD_APP_PORT}
EXPOSE ${APP_PORT}

WORKDIR /app

COPY --from=build /app/server .
COPY --from=build /app/apps/server/dist ./dist

ENTRYPOINT ["./server"]