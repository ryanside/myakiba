# Setup

## Prerequisites

You need these tools and services:

- [Bun](https://bun.sh) 1.4.4.
- Docker with Docker Compose.
- An S3 bucket with credentials for item pictures, on AWS S3 or an S3-compatible store such as MinIO. The browser loads pictures straight from the bucket's public URL, so allow public reads on the bucket.

## Local development

1. Clone the repository, install dependencies, and copy the example environment files:

   ```bash
   git clone https://github.com/ryanside/myakiba.git
   cd myakiba
   bun install
   cp apps/server/.env.example apps/server/.env
   cp apps/web/.env.example apps/web/.env
   ```

2. Fill in `apps/server/.env`:

   | Variable                                                                             | Local value                                                                                                                                       |
   | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `DATABASE_URL`                                                                       | `postgresql://postgres:password@localhost:5432/myakiba`                                                                                           |
   | `REDIS_HOST`                                                                         | `localhost`                                                                                                                                       |
   | `REDIS_PORT`                                                                         | `6379`                                                                                                                                            |
   | `REDIS_PASSWORD`                                                                     | Leave empty.                                                                                                                                      |
   | `CORS_ORIGIN`                                                                        | `http://localhost:3001`                                                                                                                           |
   | `BETTER_AUTH_URL`                                                                    | `http://localhost:3000`                                                                                                                           |
   | `BETTER_AUTH_SECRET`                                                                 | At least 32 characters. Run `openssl rand -base64 32` to print one.                                                                               |
   | `TURNSTILE_SECRET_KEY`                                                               | `1x0000000000000000000000000000000AA`, [Cloudflare's always-pass test key](https://developers.cloudflare.com/turnstile/troubleshooting/testing/). |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                                           | Required. If you do not need Google sign-in, use any non-empty placeholder.                                                                       |
   | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                                | Required. If you do not need email, use any non-empty placeholder.                                                                                |
   | `AWS_BUCKET_NAME`, `AWS_BUCKET_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Your bucket name, region, and credentials.                                                                                                        |
   | `AWS_BUCKET_URL`                                                                     | Optional. Set to the bucket's public base URL, such as a CDN or custom domain, when you do not use the default AWS URL.                           |
   | `S3_ENDPOINT_URL`                                                                    | Optional. Set only for an S3-compatible store other than AWS. If you set it, also set `AWS_BUCKET_URL`.                                           |
   | `POSTHOG_API_KEY`, `BETTER_AUTH_API_KEY`                                             | Optional. Leave empty.                                                                                                                            |

3. Fill in `apps/web/.env`:

   | Variable                  | Local value                                                    |
   | ------------------------- | -------------------------------------------------------------- |
   | `VITE_SERVER_URL`         | `http://localhost:3000`                                        |
   | `VITE_TURNSTILE_SITE_KEY` | `1x00000000000000000000AA`, Cloudflare's always-pass test key. |

4. Start the local stack:

   ```bash
   bun dev
   ```

`bun dev` starts the Postgres and Redis containers, pushes the database schema, and runs the API, the web app, and Drizzle Kit Studio:

- The web app runs at [http://localhost:3001](http://localhost:3001).
- The API runs at [http://localhost:3000](http://localhost:3000).
- Drizzle Kit Studio is available at [https://local.drizzle.studio](https://local.drizzle.studio).

Run `bun stop` to stop the Postgres and Redis containers.

## Production build with Docker Compose

The root `docker-compose.yml` builds and runs Postgres, Redis, the schema push, and the server. The server also serves the web app.

1. From the repository root, copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

2. Fill in `.env` with the values from the two tables in [Local development](#local-development), except for these six lines:

   ```dotenv
   POSTGRES_DB=myakiba
   POSTGRES_USER=postgres
   POSTGRES_PASSWORD=password
   DATABASE_URL=postgresql://postgres:password@postgres:5432/myakiba
   REDIS_HOST=redis
   CORS_ORIGIN=http://localhost:3000
   ```

3. Build and start the stack:

   ```bash
   docker compose up -d --build
   ```

Open the app at [http://localhost:3000](http://localhost:3000). Run `docker compose down` to stop the stack.

## Email verification without Resend

Email and password sign-up requires a verified email, and no mail arrives with a placeholder Resend key. After you sign up, mark your account verified in Postgres:

- **With `bun dev`.** Open [Drizzle Kit Studio](https://local.drizzle.studio). Set `email_verified` to `true` on your row in the `user` table.
- **With Docker Compose.** To mark every account in the local database as verified, run this command from the repository root:

  ```bash
  docker compose exec postgres psql -U postgres -d myakiba -c 'UPDATE "user" SET email_verified = true;'
  ```

## Run the extension against a local instance

The store extension connects only to [myakiba.app](https://myakiba.app), and you need the extension to add items to a local instance.

1. Build a local copy that connects to your web app. For the Docker Compose stack, pass `WXT_WEB_ORIGIN=http://localhost:3000` instead of port 3001. Keep `--mode e2e`, because a build without it allows only production origins.

   - **Chrome.**

     ```bash
     cd apps/extension
     WXT_WEB_ORIGIN=http://localhost:3001 bunx wxt build --mode e2e
     ```

   - **Firefox.**

     ```bash
     cd apps/extension
     WXT_WEB_ORIGIN=http://localhost:3001 bunx wxt build -b firefox --mode e2e
     ```

2. Load the extension in your browser:

   - **Chrome.** Open `chrome://extensions` and turn on **Developer mode**. Click **Load unpacked** and select `apps/extension/.output/chrome-mv3-e2e/`.
   - **Firefox.** Open `about:debugging#/runtime/this-firefox`. Click **Load Temporary Add-on…** and select `manifest.json` in `apps/extension/.output/firefox-mv3-e2e/`. Firefox removes a temporary add-on when it closes.
