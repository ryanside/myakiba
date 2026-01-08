FROM oven/bun:1.3-debian
WORKDIR /app
COPY bun.lock package.json ./
COPY packages/db/package.json ./packages/db/package.json
COPY packages/config/package.json ./packages/config/package.json
RUN bun install --frozen-lockfile
COPY packages/db ./packages/db
COPY packages/config ./packages/config
WORKDIR /app/packages/db
CMD ["bun", "run", "db:push:force"]
