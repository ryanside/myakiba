import Redis from "ioredis";

export const createFetchOptions = (image: boolean = false) => ({
  proxy: process.env.HTTP_PROXY,
  tls: {
    rejectUnauthorized: false,
  },
  headers: {
    ...(!image && { "Accept-Encoding": "gzip, deflate, br" }),
  },
  signal: AbortSignal.timeout(10000),
});

export const normalizeDateString = (dateStr: string): string => {
  const trimmed = dateStr.trim();

  // Handle year only (e.g., "2006")
  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-01-01`;
  }

  // Handle MM/YYYY format (e.g., "09/2010")
  if (/^\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [month, year] = trimmed.split("/");
    const paddedMonth = month.padStart(2, "0");
    return `${year}-${paddedMonth}-01`;
  }

  // Try to parse as a regular date - if it fails, default to a fallback
  try {
    const date = new Date(trimmed);
    if (isNaN(date.getTime())) {
      throw new Error("Invalid date");
    }
    return date.toISOString().split("T")[0]; // Return YYYY-MM-DD format
  } catch {
    // If all else fails, return a default date or throw an error
    console.warn(`Unable to parse date: "${dateStr}". Using fallback date.`);
    return "1970-01-01"; // Fallback date
  }
};

export const setJobStatus = async (
  redis: Redis,
  jobId: string,
  status: string,
  finished: boolean
) => {
  await redis.set(
    `job:${jobId}:status`,
    JSON.stringify({
      status: status,
      finished: finished,
      createdAt: new Date().toISOString(),
    }),
    "EX",
    60
  );
};

type Success<T> = {
  data: T;
  error: null;
};

type Failure<E> = {
  data: null;
  error: E;
};

export type Result<T, E = Error> = Success<T> | Failure<E>;

// Main wrapper function
export async function tryCatch<T, E = Error>(
  promise: Promise<T>
): Promise<Result<T, E>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error as E };
  }
}
