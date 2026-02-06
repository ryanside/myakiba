import { defineConfig, type Config } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config({
  path: "../../apps/server/.env",
});

const config = defineConfig({
  schema: "./src/schema",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
}) satisfies Config;

export default config;
