# Sign in and sign out

A user with a verified email signs in with email and password, lands on the dashboard, and can sign out from the header's user menu. A signed-in user who opens `/login` is sent to the dashboard.

## Sub-features

- `signin-email` signs in with email and password and lands on `/dashboard`.
- `signin-redirect` sends a signed-in user from `/login` to `/dashboard`, and a signed-out user from any app route to `/login?redirect=<path>`.
- `signin-error` shows an error toast for a wrong password or an unverified email.
- `signin-onboarding` shows the `Welcome to myakiba.` dialog on first visit and closes it.
- `signout` signs out from the user menu and returns to `/login`.

## How to get to it (user POV)

- Open `<url>/login` directly, or follow the `Login` link from `/signup`.
- Open any app route such as `<url>/collection` while signed out.
- Sign out from the avatar menu at the right end of the header.

## Driving it with preview tools

Preconditions:

- `$H seed-user <run>` has run. The tab is signed out (a fresh run, or after `signout`).

- **Open login.** `preview_open` with `url: "<url>/login"` and `reuseExistingTab: false`. The page shows textboxes `Email` and `Password` and a button `Login`.
- **Enter credentials.** `preview_type` with `locator: "role=textbox[name='Email']"` and `text: "verify@example.com"`, then `locator: "role=textbox[name='Password']"` and `text: "verify-password-1"`. Driven.
- **Submit.** `preview_click` with `locator: "role=button[name='Login']"`, then `preview_wait_for` with `urlIncludes: "/dashboard"`. The page title is `Dashboard - myakiba`. Driven.
- **Confirm the session.** `preview_evaluate` with `fetch('/api/auth/get-session').then(r => r.json())`. `user.email` is `verify@example.com`. `$H logs <run>` has `"method":"POST","path":"/api/auth/sign-in/email"` with `"status":200`. Driven.
- **Close onboarding.** `preview_click` with `locator: "role=dialog >> role=button[name='Close']"`. The dialog stays in the DOM for its exit animation, so read `document.querySelectorAll("[role=dialog]").length` again after a second call. It reaches `0`. Driven.
- **Redirect while signed in.** `preview_navigate` to `<url>/login`. The URL ends at `/dashboard`. Driven.
- **Wrong password.** Sign out, then submit `verify@example.com` with `wrong-password-1`. The `Notifications` region reads `Invalid email or password` and the URL stays `/login`. Driven.
- **Unverified email.** `$H seed-user <run> unverified@example.com`, then `$H psql <run> "update \"user\" set email_verified = false where email = 'unverified@example.com'"`, then submit those credentials. The toast reads `Please verify your email address. Check your inbox for a verification email.`
- **Sign out.** `preview_click` with `selector: "header button[aria-haspopup='menu']"`, then `locator: "role=menuitem[name='Sign Out']"`, then `preview_wait_for` with `urlIncludes: "/login"`. `/api/auth/get-session` answers `null`. Driven.
- **Proof.** Save the post-login `preview_snapshot` and the get-session JSON to `evidence/sign-in/`.

## Gotchas

- Sessions live only in Redis. The Postgres `session` table stays empty, so prove a session with `/api/auth/get-session`, not SQL.
- While submitting, the `Login` button shows only a spinner and loses its name. Wait on the URL, not on the button.
- The avatar menu trigger has no accessible name. Use the `header button[aria-haspopup='menu']` selector.
- The default preview profile keeps the session cookie for this run's origin across tabs. Open an `incognito` profile tab for a clean signed-out start.
- Sign-in calls Cloudflare Turnstile. Without internet access, sign-in and `seed-user` fail on the captcha.
- Each run has a new origin, so the onboarding dialog returns every run.
