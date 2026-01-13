import * as authSchema from "./schema/auth";
import * as figureSchema from "./schema/figure";
import { drizzle } from "drizzle-orm/bun-sql";
import { env } from "@myakiba/env/shared";

const schema = {
  ...authSchema,
  ...figureSchema,
};

export const db = drizzle(env.DATABASE_URL, { schema });
