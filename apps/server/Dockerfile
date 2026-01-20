# Build stage
FROM oven/bun:1.3-debian AS build

WORKDIR /app

# Copy dependencies
COPY bun.lock package.json ./
COPY /apps/server/package.json ./apps/server/package.json
COPY /apps/web/package.json ./apps/web/package.json
COPY /apps/worker/package.json ./apps/worker/package.json
COPY /packages/auth/package.json ./packages/auth/package.json
COPY /packages/constants/package.json ./packages/constants/package.json
COPY /packages/db/package.json ./packages/db/package.json
COPY /packages/env/package.json ./packages/env/package.json
COPY /packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY /packages/config/package.json ./packages/config/package.json
COPY /packages/types/package.json ./packages/types/package.json
COPY /packages/utils/package.json ./packages/utils/package.json
COPY /packages/validations/package.json ./packages/validations/package.json

# Install dependencies (--ignore-scripts skips native compilation for optional deps like msgpackr-extract)
RUN bun install --frozen-lockfile --verbose --ignore-scripts

# Copy the rest of the application
COPY . .

# Build the frontend
ARG SOURCE_COMMIT
ENV VITE_BUILD_ID=${SOURCE_COMMIT:-dev}
WORKDIR /app/apps/web
RUN bun run build

# Build the server
WORKDIR /app

RUN bun build --compile --minify --sourcemap --packages bundle ./apps/server/src/index.ts --outfile server
RUN bun build --compile --minify-whitespace --minify-syntax ./apps/server/src/index.ts --outfile server

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