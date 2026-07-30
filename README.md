<div align="center">

  <h1>myakiba.app</h1>

  <a href="https://discord.gg/VKHVvhcC2z">
    <img alt="Discord" src="https://img.shields.io/badge/chat-Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white">
  </a>
  <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/ryanside/myakiba?style=for-the-badge&logo=github">

</div>

<br />

**[myakiba](https://myakiba.app)** is a collection management tool for Japanese pop-culture goods. Track your collection, orders, and analytics with a modern interface.

Early in development.

![myakiba](apps/web/public/og-image.png)

The community-powered catalog from **MyFigureCollection** and the flexibility of spreadsheets, coupled with new and convenient features for collectors, unified into one collection management tool.

## Motivation

- MyFigureCollection’s collection manager felt limited and its UI/UX dated, but it has the most comprehensive database for collectors.
- Spreadsheets are flexible and easy to edit, but they’re fragmented and don’t provide real item data or a unified platform.
- New collection tools have appeared, but most still rely on users manually entering item information.

myakiba is being created in hopes to be a useful alternative, as well as a fun/learning/hobby project for myself.

## Features

### Core features

- **Sync from MyFigureCollection without starting over.** Import an MFC CSV or paste item links to add MFC items to your collection and orders. myakiba pulls in the item information for you.
- **Manage your collection.** Get the flexibility of a spreadsheet with the item information from MFC already attached. Track what you own, what you paid, where you bought it, its condition, dates, tags, notes, and more.
- **Multi-item orders.** Group multiple items into an order, follow each order from Ordered to Owned, and keep track of shipping, taxes, duties, tariffs, and other fees.
- **See what is coming up.** Use the dashboard and personal calendar to check upcoming releases,
  active orders, unpaid costs, and what is happening each month.
- **See where your money goes.** Break down paid spend and unpaid costs by date, shop, item prices,
  order fees, and shipping method.
- **See what shapes your collection.** Find your most-collected and highest-spend artists,
  characters, origins, companies, shops, scales, and more.

### Tech

- **TypeScript**
- **React and Vite**
- **TanStack Router, Query, Table, and Form**
- **Tailwind CSS and shadcn/ui**
- **Elysia and Bun**
- **Better Auth**
- **PostgreSQL and Drizzle ORM**
- **Redis and BullMQ**
- **AWS S3**
- **Turborepo**

## Page showcase

### Dashboard

The overview puts your total items, total spend, active orders, and unpaid costs up front. It also
shows a collection breakdown, your order activity for the year, and a release calendar. Switch to
the monthly view to focus on one month at a time with order totals, fees, shop breakdowns, and an
order board.

![Dashboard](apps/web/public/dashboard-light.webp)

### Collection

View your collection as a table, a card grid, or an image gallery. Filter
and sort it, choose which columns to show, then move, resize, or pin those columns to fit how you
collect. Prices, scores, counts, releases, shops, and dates can all be edited directly in
the table.

![Collection](apps/web/public/collection-light.webp)

### Orders

Keep preorders organized by status, shop, release date, payment date, shipping date,
and collection date. Each order can hold multiple items, with separate item prices plus shipping,
taxes, duties, tariffs, and other fees. Orders also have table, card, and gallery views, along with
the same filtering and column controls as your collection.

![Orders](apps/web/public/orders-light.webp)

### Analytics

See the artists, characters, origins, companies, classifications, events, materials, shops, and
scales that make up your collection. Each section shows the top results by item count and by spend.
Open one for a searchable table, totals that update with your filters, and the exact collection
items behind each result.

![Analytics](apps/web/public/analytics-light.webp)

## Roadmap

myakiba is still in active development. Current priorities:

- [ ] Refine existing features
- [ ] Profiles

## Run locally

### Prerequisites

- [Bun 1.3.9](https://bun.sh/) (the version pinned in `package.json`)
- Docker with Docker Compose
- An AWS S3 bucket and credentials
- An HTTP proxy is optional but recommended

### Auth services

- Google OAuth is optional, but its environment variables must be non-empty. Use placeholders if
  you do not need Google sign-in.
- Resend is required for email verification and password resets. Without Resend, use non-empty placeholders and manually set `email_verified` to `true` in Postgres.

For Turnstile, use Cloudflare's
[official test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/):

```dotenv
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA
```

### Run with `bun dev`

1. Clone the repository:

```bash
git clone https://github.com/ryanside/myakiba.git
cd myakiba
```

1. Install dependencies:

```bash
bun install
```

1. Create the app environment files:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
cp apps/worker/.env.example apps/worker/.env
```

Use these values for the services that run locally:

```dotenv
# apps/server/.env and apps/worker/.env
DATABASE_URL=postgresql://postgres:password@localhost:5432/myakiba
REDIS_HOST=localhost
REDIS_PORT=6379

# apps/server/.env
CORS_ORIGIN=http://localhost:3001
BETTER_AUTH_URL=http://localhost:3000

# apps/web/.env
VITE_SERVER_URL=http://localhost:3000
```

Fill in the remaining auth, email, Turnstile, and S3 values in the example files. The worker
can read AWS credentials from `apps/worker/.env` or the standard AWS credential chain.
`WORKER_PROXY_URL`, `AWS_BUCKET_URL`, `POSTHOG_API_KEY`, and `BETTER_AUTH_API_KEY` are optional.
When `AWS_BUCKET_URL` is omitted, object URLs use the bucket's regional S3 URL.

1. Start the app:

```bash
bun dev
```

This command also starts the Postgres and Redis containers and pushes the database schema.
Open [http://localhost:3001](http://localhost:3001). The API runs at
[http://localhost:3000](http://localhost:3000).

Run `bun stop` when you want to stop the Postgres and Redis containers.

### Run the full stack with Docker Compose

The root `docker-compose.yml` runs Postgres, Redis, the schema push, the server and bundled web
app, and the worker.

1. Create the Compose environment file:

```bash
cp .env.example .env
```

Use the Compose service names for database and Redis connections:

```dotenv
POSTGRES_DB=myakiba
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
DATABASE_URL=postgresql://postgres:password@postgres:5432/myakiba

REDIS_HOST=redis
REDIS_PORT=6379

CORS_ORIGIN=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
VITE_SERVER_URL=http://localhost:3000
```

Fill in the remaining required values in `.env`. The same optional variables listed in the
`bun dev` setup may stay empty.

1. Build and start the stack:

```bash
docker compose up -d --build
```

Open [http://localhost:3000](http://localhost:3000). To follow startup logs or stop the stack:

```bash
docker compose logs -f
docker compose down
```

## Project structure

```
myakiba/
├── apps/
│   ├── web/            # Frontend (Vite + React + TanStack Router)
│   ├── server/         # API and production web server (Elysia + Bun)
│   └── worker/         # Scraping and background jobs (BullMQ)
├── packages/
│   ├── auth/           # Better Auth configuration
│   ├── config/         # Shared TypeScript configuration
│   ├── contracts/      # Shared Zod schemas, constants, and types
│   ├── db/             # Drizzle schema and database scripts
│   ├── env/            # Typed environment schemas
│   ├── redis/          # Redis clients, job status, and local Compose setup
│   └── utils/          # Shared utilities
├── CONTEXT.md          # Expense domain glossary
├── docker-compose.yml  # Local full-stack build
├── docker-compose.production.yml
│                       # Production stack using published images
└── turbo.json          # Turborepo task pipeline
```

## Contributors

[![Contributors](https://contrib.rocks/image?repo=ryanside/myakiba)](https://github.com/ryanside/myakiba/graphs/contributors)

Made with [contrib.rocks](https://contrib.rocks).

### Interested in contributing?

Contributions are welcome. Open an issue or submit a pull request.

# Star history

[![Star History Rank](https://api.star-history.com/badge?repo=ryanside/myakiba)](https://www.star-history.com/ryanside/myakiba)
