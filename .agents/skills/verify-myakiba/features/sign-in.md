# Sign in and sign out

A user with a verified email signs in with email and password and lands on the dashboard, or on the page they first asked for. A first sign-in opens the onboarding dialog. The user signs out from the header's account menu.

## Sub-features

- `signin-email` signs in with email and password and lands on `/dashboard`.
- `signin-redirect` sends a signed-out user from any app route to `/login?redirect=<path>` and back to that path after sign-in. It sends a signed-in user from `/login` to `/dashboard`.
- `signin-error` shows an error toast for a wrong password or an unverified email.
- `signin-onboarding` walks the three-step `Welcome to myakiba.` dialog on first sign-in and ends on the Add page.
- `signout` signs out from the account menu and returns to `/login`.

## How to get to it (user POV)

- Open `<url>/login` directly.
- Open any app route such as `<url>/collection` while signed out.
- Sign out from the `Account menu` button at the right end of the header.

## Driving it with preview tools

Preconditions:

- `$H seed-user <run>` has run. The tab is signed out (a fresh run, or after `signout`).

- **Open login.** `preview_open` with `url: "<url>/login"` and `reuseExistingTab: false`. The title is `Login - myakiba`. The page has textboxes `Email` and `Password`, buttons `Sign in` and `Continue with Google`, and links `Create an account` and `Forgot password?`.
- **Wrong password.** Type `verify@example.com` into `role=textbox[name='Email']` and `wrong-password-1` into `role=textbox[name='Password']`, then click `role=button[name='Sign in']`. The `Notifications` region reads `Invalid email or password`, the URL stays `/login`, and `$H logs <run>` has `POST /api/auth/sign-in/email` with `"status":401`.
- **Sign in.** Type `verify-password-1` into the password box with `clear: true`, click `Sign in`, then `preview_wait_for` with `urlIncludes: "/dashboard"`. The title is `Dashboard - myakiba`.
- **Confirm the session.** Read `fetch('/api/auth/get-session').then(r => r.json())`. `user.email` is `verify@example.com`. `$H logs <run>` has `"method":"POST","path":"/api/auth/sign-in/email"` with `"status":200`.
- **Walk onboarding.** The dialog names its steps `Preferences`, `Extension` and `Add items`. Click `role=dialog >> role=button[name='Continue']` twice, then `role=dialog >> role=button[name='Get started']`. The URL becomes `/add`, `$H logs <run>` has `POST /api/auth/update-user`, and `$H psql <run> "select has_seen_onboarding from \"user\" where email = 'verify@example.com'"` returns `t`.
- **Or close onboarding.** Click `role=dialog >> role=button[name='Close']` on any step. From source: it writes `has_seen_onboarding` the same way.
- **Redirect while signed in.** `preview_navigate` to `<url>/login`. The URL ends at `/dashboard`.
- **Sign out.** Click `role=button[name='Account menu']`, then `role=menuitem[name='Sign Out']`, then `preview_wait_for` with `urlIncludes: "/login"`. The toast reads `Signed out successfully`, the URL is `/login?redirect=<the page you left>`, and `/api/auth/get-session` answers `null`.
- **Redirect while signed out.** `preview_navigate` to `<url>/collection`. The URL becomes `/login?redirect=%2Fcollection`.
- **Unverified email.** `$H seed-user <run> unverified@example.com`, then `$H psql <run> "update \"user\" set email_verified = false where email = 'unverified@example.com'"`, then submit those credentials on the login page. The toast reads `Please verify your email address. Check your inbox for a verification email.` and the URL stays on `/login?redirect=%2Fcollection`.
- **Sign in after the redirect.** Type `verify@example.com` and `verify-password-1` with `clear: true` and click `Sign in`. The URL becomes `/collection`.
- **Proof.** Save the post-login `preview_snapshot`, the get-session JSON and the sign-in log lines to `evidence/sign-in/`.

## Gotchas

- Sessions live only in Redis. The Postgres `session` table stays empty, so prove a session with `/api/auth/get-session`, not SQL.
- While submitting, the `Sign in` button shows only a spinner and loses its name. Wait on the URL, not on the button.
- `has_seen_onboarding` stays `f` while the dialog is open. Read it after the dialog closes.
- The Preferences step saves the username, currency and date format when you click `Continue`.
- The account menu also holds `Profile` and `Settings`.
- The default preview profile keeps the session cookie for this run's origin across tabs. Open an `incognito` profile tab for a clean signed-out start.
- Cookies ignore the port, and every run signs its cookie cache with the same secret. A session from an earlier run can survive in a profile, so sign out before `$H down`, or sign out first when the dashboard opens without a sign-in.
- Sign-in calls Cloudflare Turnstile. Without internet access, sign-in and `seed-user` fail on the captcha.
