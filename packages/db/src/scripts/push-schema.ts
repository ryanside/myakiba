import process from "node:process";
import { SQL } from "bun";
import dotenv from "dotenv";

dotenv.config({
  path: "../../apps/server/.env",
});

const SUCCESS_MESSAGES = ["Changes applied", "No changes detected"] as const;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to push the database schema");
}

const database = new SQL({ url: databaseUrl });
try {
  await database`CREATE EXTENSION IF NOT EXISTS pg_trgm`;
} finally {
  await database.close();
}

const child = Bun.spawn(["bunx", "drizzle-kit", "push", "--verbose"], {
  cwd: process.cwd(),
  env: process.env,
  stdin: "ignore",
  stdout: "pipe",
  stderr: "pipe",
});

const relay = async (stream: ReadableStream<Uint8Array>, destination: NodeJS.WriteStream) => {
  const decoder = new TextDecoder();
  let output = "";

  for await (const chunk of stream) {
    destination.write(chunk);
    output += decoder.decode(chunk, { stream: true });
  }

  output += decoder.decode();
  return output;
};

const [stdout, stderr, exitCode] = await Promise.all([
  relay(child.stdout, process.stdout),
  relay(child.stderr, process.stderr),
  child.exited,
]);

const output = `${stdout}\n${stderr}`;
const completed = SUCCESS_MESSAGES.some((message) => output.includes(message));

if (exitCode !== 0 || !completed) {
  console.error(
    "Schema push did not complete. Destructive and ambiguous changes require an interactive review.",
  );
  process.exit(1);
}
