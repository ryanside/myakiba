import { afterAll, afterEach, expect, test } from "bun:test";
import Redis from "ioredis";
import { incrementWithTtl } from "./counter";

const url = process.env.TEST_REDIS_URL;
if (!url) {
  throw new Error(
    "Set TEST_REDIS_URL to a Redis server this test can write to, such as redis://127.0.0.1:6379",
  );
}
const client = new Redis(url);
const keys: string[] = [];
const newKey = () => {
  const key = `test:counter:${crypto.randomUUID()}`;
  keys.push(key);
  return key;
};

afterEach(async () => {
  if (keys.length > 0) await client.del(...keys.splice(0));
});
afterAll(async () => {
  await client.quit();
});

test("the first increment creates the counter with the TTL", async () => {
  const key = newKey();
  expect(await incrementWithTtl(client, key, 60)).toBe(1);
  expect(await client.ttl(key)).toBe(60);
});

test("later increments count up without extending the TTL", async () => {
  const key = newKey();
  await incrementWithTtl(client, key, 60);
  await client.expire(key, 30);
  expect(await incrementWithTtl(client, key, 60)).toBe(2);
  expect(await incrementWithTtl(client, key, 60)).toBe(3);
  expect(await client.ttl(key)).toBeLessThanOrEqual(30);
});

test("the counter starts over after it expires", async () => {
  const key = newKey();
  await incrementWithTtl(client, key, 1);
  await incrementWithTtl(client, key, 1);
  await Bun.sleep(1100);
  expect(await incrementWithTtl(client, key, 1)).toBe(1);
});
