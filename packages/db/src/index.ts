import { drizzle } from "drizzle-orm/postgres-js";
import { drizzle as drizzleNeonHttpDriver } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);

// Secondary driver exclusively for batching queries
const sql = neon(process.env.DATABASE_URL!);
export const dbHttp = drizzleNeonHttpDriver(sql);

