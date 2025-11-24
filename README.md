<div align="center">

  <h1>myakiba.app</h1>

</div>

<div align="center">

  <a href="https://discord.gg/VKHVvhcC2z" target="_blank">
    <img alt="Discord" src="https://img.shields.io/discord/1234567890?style=for-the-badge&logo=discord&logoColor=%23ffffff">
  </a>
  <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/ryanside/myakiba?style=for-the-badge&logo=github">

</div>

<br />

**[myakiba](https://myakiba.app)** is a collection management tool for collectors of Japanese media and collectables. Track your collection, manage orders, view insightful analytics, and stay organized with an intuitive and modern interface.

Early in development.

![myakiba](apps/web/public/og-image.png)

The community-powered catalog from **MyFigureCollection** and the flexibility of spreadsheets, coupled with new and convenient features for collectors, unified into one collection management tool.

## Motivation

- MyFigureCollection’s collection manager felt limited and its UI/UX dated, but it has the most comprehensive database for collectors.
- Spreadsheets are flexible and easy to edit, but they’re fragmented and don’t provide real item data or a unified platform.
- New collection tools have appeared, but most still rely on users manually entering item information.

I wasn’t satisfied with any of these options as a collector, so I built my own.

## Features

### Core Features

- **Collection Management** - Organize and track your entire figure collection with detailed item information from MyFigureCollection
- **Order Management** - Manage pre-orders, track shipments, and monitor order status
- **Analytics** - Visualize spending patterns, collection statistics, and trends
- **Expense Tracking** - See exactly where your money goes: item prices, shipping, taxes, and fees.
- **Budget Control** - Compare what you’ve spent against the budget you set for yourself
- **Personalized Profile** - Share your stats, analytics, collection, and orders with your friends through your customizable profile page.

### Technical Stack

- **TypeScript**
- **React (Vite)** - Frontend
- **TanStack Router, Query, Table, Form** - Major frontend tools
- **TailwindCSS & shadcn/ui** - Styling
- **Hono** - Backend
- **Bun** - Runtime + package manager
- **Drizzle** - ORM
- **PostgreSQL** - Database
- **Redis** - Store for queues, caching, rate limiting, data
- **BullMQ** - Job queue for background processing and workers
- **Betterauth** - Authentication
- **AWS S3** - Object storage
- **Turborepo** - Monorepo

## Page Showcase

### Dashboard

Get a comprehensive overview of your collection at a glance. Monitor your spending and expenses, view upcoming releases, quickly manage orders, and more all in one central hub.

<div align="center">

![Dashboard](apps/web/public/dashboard.webp)

</div>

### Collection

Manage your entire collection with a powerful data table. Filter, sort, and organize items easily. Track collection dates, prices, shops, and more. Inline editing makes updating your collection quick and efficient.

<div align="center">

![Collection](apps/web/public/collection.webp)

</div>

### Orders

Keep track of all your orders and purchases in one place. Track payments (including shipping fees, taxes, tariffs, etc.), statuses, dates, shops. Manage multiple items per order. Customizable columns and filters.

<div align="center">

![Orders](apps/web/public/orders.webp)

</div>

### Analytics

Dive deep into your collection data with comprehensive analytics. Visualize spending trends, analyze purchase patterns, track collection growth, and gain insights into your collecting habits.

<div align="center">

![Analytics](apps/web/public/analytics.webp)

</div>

## Roadmap

myakiba is actively being developed with more features on the horizon:

- [ ] **Better MFC Sync options**
- [ ] **Profile page**
- [ ] **Expense tracking**
- [ ] **More Analytics**

## Self-host/Run Locally

### Prerequisites

- Bun
- PostgreSQL database
- Redis
- IP Proxy (Recommended)
- AWS S3

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/myakiba.git
cd myakiba
```

2. Install dependencies:

```bash
bun install
```

3. Set up your environment variables:

Create a `.env` file in `apps/server/`, `apps/web`, `apps/worker` with your environment variables. Check `.env.example` in these directories for environment variables you need.

4. Apply the database schema:

```bash
bun db:push
```

5. Start the development server:

```bash
bun dev
```

6. Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.

The API is running at [http://localhost:3000](http://localhost:3000).

## Project Structure

```
myakiba/
├── apps/
│   ├── web/         # Frontend application (Vite-React + TanStack Router)
│   ├── server/      # Backend API (Hono + Bun)
│   └── worker/      # Background worker for scraping and jobs
├── packages/
│   └── eslint-config/  # Shared ESLint configuration
```

## Contributors

<a href="https://github.com/ryanside/myakiba/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ryanside/myakiba" />
</a>

Made with [contrib.rocks](https://contrib.rocks).

### Interested in Contributing?

Contributions are welcome! Please feel free to submit a Pull Request.

# Star History

<p align="center">
  <a target="_blank" href="https://star-history.com/#yourusername/myakiba&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ryanside/myakiba&type=Date&theme=dark">
      <img alt="GitHub Star History for yourusername/myakiba" src="https://api.star-history.com/svg?repos=ryanside/myakiba&type=Date">
    </picture>
  </a>
</p>
