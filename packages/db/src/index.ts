import * as authSchema from "./schema/auth";
import * as figureSchema from "./schema/figure";
import { drizzle } from "drizzle-orm/bun-sql";

const schema = {
  ...authSchema,
  ...figureSchema,
};

export const db = drizzle(process.env.DATABASE_URL!, { schema });
