import { drizzle } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNeonHttpDriver } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";

export const db = drizzle(process.env.DATABASE_URL!);

// Secondary driver exclusively for batching queries
const sql = neon(process.env.DATABASE_URL!);
export const dbHttp = drizzleNeonHttpDriver(sql);
