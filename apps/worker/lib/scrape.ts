import * as cheerio from "cheerio";
import path from "node:path";
import { URL } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createError } from "evlog";
import * as z from "zod";
import {
  extractArrayData,
  extractArrayDataWithIds,
  extractEntitiesWithRoles,
  extractDimensions,
  extractReleaseData,
  extractMaterialsData,
} from "./extract";
import { createFetchOptions, publishJobStatus, recordItemOutcome } from "./utils";
import type {
  ScrapedItem,
  ScrapeFailure,
  ScrapeResult,
  ScrapeImageParams,
  ScrapeSingleItemParams,
  ScrapeItemsParams,
} from "./types";
import type { Category } from "@myakiba/contracts/shared/types";
import { CATEGORIES } from "@myakiba/contracts/shared/constants";
import { SYNC_STATUS_MESSAGES } from "@myakiba/contracts/sync/messages";
import { env } from "@myakiba/env/worker";

const s3Client = new S3Client({
  region: env.AWS_BUCKET_REGION,
});

const MFC_BASE_URL = "https://myfigurecollection.net";
const MFC_HOSTNAME = "myfigurecollection.net";
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_REDIRECTS = 3;
const ALLOWED_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

const allowedImageUrlSchema = z
  .instanceof(URL)
  .refine((url) => url.protocol === "https:")
  .refine((url) => url.username === "" && url.password === "")
  .refine((url) => url.port === "")
  .refine((url) => {
    const hostname = url.hostname.toLowerCase();
    return hostname === MFC_HOSTNAME || hostname.endsWith(`.${MFC_HOSTNAME}`);
  });

const imageResponseMetadataSchema = z.object({
  contentType: z
    .string()
    .transform((value) => value.split(";", 1)[0]?.trim().toLowerCase() ?? "")
    .pipe(z.enum(ALLOWED_IMAGE_CONTENT_TYPES)),
  contentLength: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().safe().int().nonnegative().max(MAX_IMAGE_SIZE_BYTES))
    .nullable(),
});

const parseAllowedImageUrl = (rawUrl: string, baseUrl: string | URL = MFC_BASE_URL): URL => {
  let url: URL;
  try {
    url = new URL(rawUrl, baseUrl);
  } catch {
    throw createError({
      message: "Image URL is malformed",
      why: "Image URL could not be resolved against the MyFigureCollection origin",
      fix: "Use a valid MyFigureCollection image URL",
    });
  }

  const result = z.safeParse(allowedImageUrlSchema, url);
  if (!result.success) {
    throw createError({
      message: "Image URL is not an allowed MyFigureCollection HTTPS URL",
      why: `Rejected image URL destination ${url.origin}`,
      fix: "Use an HTTPS image URL on myfigurecollection.net or an approved subdomain",
    });
  }

  return result.data;
};

const cancelResponseBody = async (response: Response): Promise<void> => {
  await response.body?.cancel().catch(() => null);
};

const readImageBody = async (response: Response): Promise<Buffer> => {
  if (!response.body) {
    throw createError({
      message: "Image response has no body",
      why: "The upstream server returned a successful response without a readable body",
    });
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_SIZE_BYTES) {
      const sizeError = createError({
        message: "Image response exceeds the allowed size",
        why: `Streamed image size exceeded ${MAX_IMAGE_SIZE_BYTES} bytes`,
      });
      await reader.cancel("Image response exceeded the allowed size").catch(() => null);
      throw sizeError;
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks, totalBytes);
};

export const scrapeImage = async ({
  imageUrl,
  log,
  maxRetries = 3,
  baseDelayMs = 1000,
}: ScrapeImageParams) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let finalUrl = parseAllowedImageUrl(imageUrl);
      let response: Response;
      let redirectCount = 0;

      while (true) {
        response = await fetch(finalUrl, {
          ...createFetchOptions(true),
          redirect: "manual",
        });

        if (response.status < 300 || response.status >= 400) break;

        const location = response.headers.get("location");
        if (!location) {
          await cancelResponseBody(response);
          throw createError({
            message: `Image redirect from ${finalUrl.href} is missing Location`,
            status: response.status,
            why: "Upstream returned a redirect without a destination",
          });
        }
        if (redirectCount >= MAX_IMAGE_REDIRECTS) {
          await cancelResponseBody(response);
          throw createError({
            message: `Image redirect limit exceeded for ${imageUrl}`,
            status: response.status,
            why: `Upstream required more than ${MAX_IMAGE_REDIRECTS} redirects`,
          });
        }

        await cancelResponseBody(response);
        finalUrl = parseAllowedImageUrl(location, finalUrl);
        redirectCount += 1;
      }

      if (!response.ok) {
        const responseError = createError({
          message: `HTTP ${response.status} for ${finalUrl.href}`,
          status: response.status,
          why: "Image URL returned non-OK status",
        });
        await cancelResponseBody(response);
        throw responseError;
      }

      const metadataResult = z.safeParse(imageResponseMetadataSchema, {
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
      });
      if (!metadataResult.success) {
        const metadataError = createError({
          message: "Image response metadata failed validation",
          why: `Response must be an allowed raster image no larger than ${MAX_IMAGE_SIZE_BYTES} bytes`,
          fix: "Verify the image URL returns JPEG, PNG, WebP, GIF, or AVIF data",
        });
        await cancelResponseBody(response);
        throw metadataError;
      }
      const imageBuffer = await readImageBody(response);
      const filename = path.basename(finalUrl.pathname);

      const command = new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: filename,
        Body: imageBuffer,
        ContentType: metadataResult.data.contentType,
      });
      const uploadResult = await s3Client.send(command);

      if (uploadResult.$metadata.httpStatusCode !== 200) {
        throw createError({
          message: "Failed to upload image to S3",
          status: 502,
          why: `S3 PutObject returned status ${uploadResult.$metadata.httpStatusCode}`,
        });
      }

      const imageS3Url = `https://static.myakiba.app/${filename}`;

      return imageS3Url;
    } catch (error) {
      if (attempt === maxRetries) {
        log.warn(`Image scrape exhausted retries for ${imageUrl}`);
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      log.warn(`Image scrape attempt ${attempt}/${maxRetries} failed: ${message}`);

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  return null;
};

export const scrapeSingleItem = async ({
  id,
  log,
  maxRetries = 3,
  baseDelayMs = 1000,
  redis,
  state,
}: ScrapeSingleItemParams): Promise<ScrapedItem | null> => {
  const attemptErrors: string[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let retryItem = true;

    try {
      const url = `https://myfigurecollection.net/item/${id}`;

      const response = await fetch(url, createFetchOptions());

      if (!response.ok) {
        throw createError({
          message: `HTTP ${response.status} for item ${id}`,
          status: response.status,
          why: "MFC item page returned non-OK status",
        });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const title = $("h1.title").text().trim();

      let category: Category | null = null;
      const classification: { id: number; name: string; role: string }[] = [];
      const version: string[] = [];
      let scale = "";
      let height = 0;
      let width = 0;
      let depth = 0;
      const origin: { id: number; name: string }[] = [];
      const character: { id: number; name: string }[] = [];
      const company: { id: number; name: string; role: string }[] = [];
      const artist: { id: number; name: string; role: string }[] = [];
      let releaseDate: {
        date: string;
        type: string;
        price: number;
        priceCurrency: string;
        barcode: string;
      }[] = [];
      const event: { id: number; name: string; role: string }[] = [];
      const materials: { id: number; name: string }[] = [];

      const dataFields = $(".data-field");

      for (const dataField of dataFields) {
        const $element = $(dataField);
        const $label = $element.find(".data-label");
        const label = $label.text().trim();

        const $dataValue = $element.find(".data-value");

        switch (label) {
          case "Category": {
            const rawCategory = $element.find("span").text().trim();
            if (CATEGORIES.includes(rawCategory as Category)) {
              category = rawCategory as Category;
            }
            break;
          }
          case "Classification":
          case "Classifications":
            classification.push(...extractEntitiesWithRoles($element, $));
            break;
          case "Origin":
          case "Origins":
            origin.push(...extractArrayDataWithIds($element, $));
            break;
          case "Character":
          case "Characters":
            character.push(...extractArrayDataWithIds($element, $));
            break;
          case "Company":
          case "Companies":
            company.push(...extractEntitiesWithRoles($element, $));
            break;
          case "Artist":
          case "Artists":
            artist.push(...extractEntitiesWithRoles($element, $));
            break;
          case "Version":
            version.push(...extractArrayData($element, "a", $));
            break;
          case "Material":
          case "Materials":
            materials.push(...extractMaterialsData($element, $));
            break;
          case "Event":
          case "Events":
            event.push(...extractEntitiesWithRoles($element, $));
            break;
          case "Dimensions": {
            const dimensionText = $dataValue.text().trim();
            const dimensions = extractDimensions(dimensionText, $element);
            scale = dimensions.scale;
            height = dimensions.height;
            width = dimensions.width;
            depth = dimensions.depth;
            break;
          }
          default:
            if (label.startsWith("Releases")) {
              releaseDate = extractReleaseData($element, $);
            }
            break;
        }
      }

      if (!category) {
        throw createError({
          message: `Invalid or missing category for item ${id}`,
          why: "Item page does not contain a recognized category",
        });
      }

      let image = "";
      const imageElement = $(".item-picture img").first();
      const imageUrl = imageElement.attr("src");

      if (imageUrl) {
        try {
          const imageResponse = await scrapeImage({ imageUrl, log, maxRetries, baseDelayMs });
          if (!imageResponse) {
            throw createError({
              message: `Failed to scrape image for item ${id}`,
              why: "Image scrape returned null after all retries",
            });
          }
          image = imageResponse;
        } catch (error) {
          retryItem = false;
          throw error;
        }
      }

      const scrapedItem: ScrapedItem = {
        id,
        title,
        category,
        classification,
        origin,
        character,
        company,
        artist,
        version,
        releaseDate,
        event,
        materials,
        scale,
        height,
        width,
        depth,
        image,
      };

      if (redis && state && state.progress) {
        recordItemOutcome(state, { outcome: "succeeded", externalId: id, title });
        state.statusMessage = SYNC_STATUS_MESSAGES.scraping(
          state.progress.processed,
          state.progress.total,
        );
        await publishJobStatus({ redis, state, terminalState: null, error: null });
      }

      return scrapedItem;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attemptErrors.push(message);

      if (!retryItem || attempt === maxRetries) {
        log.warn(
          retryItem
            ? `Item ${id} failed after ${maxRetries} attempts`
            : `Item ${id} failed after image scrape exhausted retries`,
        );
        if (redis && state && state.progress) {
          recordItemOutcome(state, {
            outcome: "failed",
            externalId: id,
            failureReason: message,
          });
          state.statusMessage = SYNC_STATUS_MESSAGES.scraping(
            state.progress.processed,
            state.progress.total,
          );
          await publishJobStatus({ redis, state, terminalState: null, error: null });
        }
        const finalError = error instanceof Error ? error : new Error(String(error));
        (finalError as Error & { attemptErrors: string[] }).attemptErrors = attemptErrors;
        throw finalError;
      }

      log.warn(`Item ${id} attempt ${attempt}/${maxRetries} failed: ${message}`);

      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  return null;
};

export const scrapeItems = async ({
  itemIds,
  log,
  maxRetries = 3,
  baseDelayMs = 1000,
  redis,
  state,
}: ScrapeItemsParams): Promise<ScrapeResult> => {
  const promises = itemIds.map((id) =>
    scrapeSingleItem({
      id,
      log,
      maxRetries,
      baseDelayMs,
      redis,
      state,
    }),
  );
  const results = await Promise.allSettled(promises);

  const successful: ScrapedItem[] = [];
  const failures: ScrapeFailure[] = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled" && result.value !== null) {
      successful.push(result.value);
    } else if (result.status === "rejected") {
      const reason = result.reason as Error & { attemptErrors?: string[] };
      failures.push({
        id: itemIds[i],
        attemptErrors: reason.attemptErrors ?? [reason.message ?? String(reason)],
      });
    }
  }

  if (failures.length > 0) {
    log.warn(`Failed to scrape ${failures.length}/${itemIds.length} items`);
  }

  return { successful, failures };
};

export const scrapedItemsWithRateLimit = async ({
  itemIds,
  log,
  maxRetries = 3,
  baseDelayMs = 1000,
  redis,
  state,
}: ScrapeItemsParams): Promise<ScrapeResult> => {
  const startTime = Date.now();

  const batchSize = 5;
  const delayMs = 2000;

  const allSuccessful: ScrapedItem[] = [];
  const allFailures: ScrapeFailure[] = [];
  const totalBatches = Math.ceil(itemIds.length / batchSize);

  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    log.info(`Batch ${batchNumber}/${totalBatches}: processing ${batch.length} items`);

    const { successful, failures } = await scrapeItems({
      itemIds: batch,
      log,
      maxRetries,
      baseDelayMs,
      redis,
      state,
    });
    allSuccessful.push(...successful);
    allFailures.push(...failures);

    if (i + batchSize < itemIds.length) {
      await new Promise((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  const durationMs = Date.now() - startTime;
  log.set({
    scrape: {
      durationMs,
      avgPerItemMs: Math.round(durationMs / itemIds.length),
    },
  });

  return { successful: allSuccessful, failures: allFailures };
};
