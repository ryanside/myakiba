import type Redis from "ioredis";

// One script so the TTL is set only when the counter is created, never extended.
const INCREMENT_WITH_TTL = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return count
`;

export async function incrementWithTtl(
  client: Pick<Redis, "eval">,
  key: string,
  ttlSeconds: number,
): Promise<number> {
  return Number(await client.eval(INCREMENT_WITH_TTL, 1, key, ttlSeconds));
}
