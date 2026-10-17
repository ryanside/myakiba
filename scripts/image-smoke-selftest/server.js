const mode = process.env.SELFTEST_MODE ?? "ok";
console.log(
  JSON.stringify({ environment: "production", msg: "image smoke self-test fixture", mode }),
);
if (mode === "bad-env") {
  console.error("Invalid environment variables: SELFTEST_REQUIRED");
  process.exit(1);
}
setTimeout(
  () =>
    Bun.serve({
      port: 3000,
      fetch(request) {
        const { pathname } = new URL(request.url);
        if (pathname === "/health" && mode !== "no-health") return new Response("ok");
        if (pathname === "/api/auth/ok" && mode !== "no-auth") {
          if (mode === "exit-after") setTimeout(() => process.exit(23), 50);
          return new Response("ok");
        }
        return new Response("not found", { status: 404 });
      },
    }),
  mode === "late" ? 12_000 : 0,
);
