import process from "node:process";

const SUCCESS_MESSAGES = ["Changes applied", "No changes detected"] as const;

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
