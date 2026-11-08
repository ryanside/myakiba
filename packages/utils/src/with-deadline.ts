/** Bound an optional remote call without changing the shared client's retry policy. */
export async function withDeadline<T>(run: () => Promise<T>, timeoutMs = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(run),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`No answer within ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
