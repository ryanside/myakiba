FROM oven/bun:1.3-debian
WORKDIR /app

COPY bun.lock package.json ./
COPY /apps/server/package.json ./apps/server/package.json
COPY /apps/web/package.json ./apps/web/package.json
COPY /apps/worker/package.json ./apps/worker/package.json
COPY /packages/auth/package.json ./packages/auth/package.json
COPY /packages/constants/package.json ./packages/constants/package.json
COPY /packages/db/package.json ./packages/db/package.json
COPY /packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY /packages/config/package.json ./packages/config/package.json
COPY /packages/types/package.json ./packages/types/package.json
COPY /packages/utils/package.json ./packages/utils/package.json
COPY /packages/validations/package.json ./packages/validations/package.json
COPY /packages/env/package.json ./packages/env/package.json
COPY /packages/redis/package.json ./packages/redis/package.json

RUN bun install --frozen-lockfile --ignore-scripts

COPY packages/db ./packages/db
COPY packages/config ./packages/config
COPY packages/constants ./packages/constants
COPY packages/env ./packages/env

WORKDIR /app/packages/db
CMD ["bun", "run", "db:push:force"]
