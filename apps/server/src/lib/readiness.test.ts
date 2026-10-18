import { heapStats } from "bun:jsc";
import { afterEach, describe, expect, test } from "bun:test";
import { initLogger } from "evlog";
import Redis from "ioredis";
import { readinessCheck } from "./readiness";

const TIMEOUT_MS = 50;

const INFO = "# Server\r\nloading:0\r\n";

const reply = (command: string): string =>
  command === "info" ? `$${INFO.length}\r\n${INFO}\r\n` : "+PONG\r\n";

const startRedisStandIn = async () => {
  let dropping = false;
  const held: { write: (data: string) => void; data: string }[] = [];
  const server = Bun.listen<undefined>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      data(socket, chunk) {
        const commands = [...chunk.toString().matchAll(/\*\d+\r\n\$\d+\r\n(\w+)\r\n/g)];
        const answer = commands.map((match) => reply((match[1] ?? "").toLowerCase())).join("");
        if (dropping) held.push({ write: (data) => socket.write(data), data: answer });
        else socket.write(answer);
      },
    },
  });
  return {
    port: server.port,
    drop: () => {
      dropping = true;
    },
    restore: () => {
      dropping = false;
      for (const { write, data } of held.splice(0)) write(data);
    },
    stop: () => server.stop(true),
  };
};

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("readinessCheck", () => {
  test("keeps one Redis ping pending while the connection drops packets", async () => {
    const standIn = await startRedisStandIn();
    const client = new Redis({ host: "127.0.0.1", port: standIn.port });
    cleanups.push(standIn.stop, () => client.disconnect());
    const check = readinessCheck(
      [
        {
          name: "redis",
          ping: async () => {
            await client.ping();
          },
        },
      ],
      TIMEOUT_MS,
    );
    await client.ping();
    expect(await check()).toEqual([]);

    standIn.drop();
    for (let round = 0; round < 5; round += 1) {
      const started = performance.now();
      const results = await Promise.all(Array.from({ length: 20 }, () => check()));
      expect(results).toEqual(Array.from({ length: 20 }, () => ["redis"]));
      expect(performance.now() - started).toBeLessThan(TIMEOUT_MS * 4);
      expect(client.commandQueue.length).toBeLessThanOrEqual(1);
    }

    standIn.restore();
    await Bun.sleep(TIMEOUT_MS);
    expect(await check()).toEqual([]);
    expect(client.commandQueue.length).toBe(0);

    standIn.drop();
    expect(await check()).toEqual(["redis"]);
    expect(client.commandQueue.length).toBe(1);
  });

  test("names each dependency that fails, in order", async () => {
    const down = async () => {
      throw new Error("connection refused");
    };
    const up = async () => {};
    const hangs = () => new Promise<void>(() => {});
    const check = (postgres: () => Promise<void>, redis: () => Promise<void>) =>
      readinessCheck(
        [
          { name: "postgres", ping: postgres },
          { name: "redis", ping: redis },
        ],
        TIMEOUT_MS,
      )();

    expect(await check(up, up)).toEqual([]);
    expect(await check(down, up)).toEqual(["postgres"]);
    expect(await check(up, hangs)).toEqual(["redis"]);
    expect(await check(down, hangs)).toEqual(["postgres", "redis"]);
  });

  test("keeps nothing per timed-out call while the probe stays pending", async () => {
    initLogger({ enabled: false });
    cleanups.push(() => initLogger({}));
    const check = readinessCheck([{ name: "redis", ping: () => new Promise<void>(() => {}) }], 1);
    const livePromises = async () => {
      await Bun.sleep(0);
      Bun.gc(true);
      return heapStats().objectTypeCounts.Promise ?? 0;
    };
    const timeOut = async (calls: number) => {
      const results = await Promise.all(Array.from({ length: calls }, () => check()));
      expect(results).toEqual(Array.from({ length: calls }, () => ["redis"]));
    };
    await timeOut(1);
    const before = await livePromises();

    for (let round = 0; round < 20; round += 1) await timeOut(500);

    expect((await livePromises()) - before).toBeLessThan(1000);
  });
});
