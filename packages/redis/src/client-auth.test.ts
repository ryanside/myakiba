import { afterAll, expect, test } from "bun:test";
import { initLogger } from "evlog";

const PASSWORD = "redis-test-password";
const passwordsSent: (string | undefined)[] = [];

/** A Redis stand-in that, like the production Redis, answers nothing before AUTH with its password. */
const server = Bun.listen<{ authenticated: boolean }>({
  hostname: "127.0.0.1",
  port: 0,
  socket: {
    open(socket) {
      socket.data = { authenticated: false };
    },
    data(socket, chunk) {
      for (const command of commands(chunk.toString())) {
        const [name = "", ...args] = command.map((part) => part.toUpperCase());
        const auth = args.indexOf("AUTH");
        if (name === "AUTH" || (name === "HELLO" && auth !== -1)) {
          const password = command.at(-1);
          passwordsSent.push(password);
          socket.data.authenticated = password === PASSWORD;
          if (socket.data.authenticated) {
            socket.write(name === "AUTH" ? "+OK\r\n" : "%1\r\n+server\r\n+redis\r\n");
          } else {
            socket.write("-WRONGPASS invalid password\r\n");
          }
        } else if (!socket.data.authenticated) {
          socket.write("-NOAUTH Authentication required.\r\n");
        } else if (name === "INFO") {
          socket.write("$9\r\nloading:0\r\n");
        } else {
          socket.write("+PONG\r\n");
        }
      }
    },
  },
});

function commands(text: string): string[][] {
  return text
    .split("*")
    .filter(Boolean)
    .map((frame) =>
      frame
        .split("\r\n")
        .slice(1)
        .filter((_, index) => index % 2 === 1),
    );
}

process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = String(server.port);
process.env.REDIS_PASSWORD = PASSWORD;
initLogger({ silent: true });
const { redis: client } = await import("./client");
afterAll(() => {
  client.disconnect();
  server.stop(true);
  delete process.env.REDIS_PASSWORD;
});

test("the shared Redis client signs in with REDIS_PASSWORD", async () => {
  expect(await client.ping()).toBe("PONG");
  expect(passwordsSent).toEqual([PASSWORD]);
});
