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

# Build the worker
WORKDIR /app

RUN bun build --compile --minify --sourcemap --packages bundle ./apps/worker/index.ts --outfile worker

# Our application runner
FROM gcr.io/distroless/base-debian12:nonroot AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=build /app/worker .

ENTRYPOINT ["./worker"]