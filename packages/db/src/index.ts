import * as authSchema from "./schema/auth";
import * as figureSchema from "./schema/figure";
import { drizzle } from "drizzle-orm/bun-sql";
import { SQL } from "bun";
import { env } from "@myakiba/env/shared";

const schema = {
  ...authSchema,
  ...figureSchema,
};

const client = new SQL({
  url: env.DATABASE_URL,
  max: 10,
  idleTimeout: 20,
});

export const db = drizzle({ client, schema });
