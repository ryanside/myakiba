FROM oven/bun:1.4.0-debian
ARG VITE_SERVER_URL
ARG VITE_TURNSTILE_SITE_KEY
WORKDIR /app
COPY server.js .
RUN mkdir -p dist/assets && printf 'export const env={VITE_SERVER_URL:"%s",VITE_TURNSTILE_SITE_KEY:"%s"};\n' "$VITE_SERVER_URL" "$VITE_TURNSTILE_SITE_KEY" > dist/assets/web.js
CMD ["bun", "server.js"]
