import * as cheerio from "cheerio";
import path from "path";
import { URL } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createError } from "evlog";
import {
  extractArrayData,
  extractArrayDataWithIds,
  extractEntitiesWithRoles,
  extractDimensions,
  extractReleaseData,
  extractMaterialsData,
} from "./extract";
import { createFetchOptions, setJobStatus } from "./utils";
import type {
  ScrapedItem,
  ScrapeFailure,
  ScrapeResult,
  ScrapeImageParams,
  ScrapeSingleItemParams,
  ScrapeItemsParams,
} from "./types";
import type { Category } from "@myakiba/types";
import { CATEGORIES } from "@myakiba/constants";
import { redis } from "@myakiba/redis";
import { env } from "@myakiba/env/worker";

const s3Client = new S3Client({
  region: env.AWS_BUCKET_REGION,
});

export const scrapeImage = async ({
  imageUrl,
  log,
  maxRetries = 3,
  baseDelayMs = 1000,
}: ScrapeImageParams) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(imageUrl, createFetchOptions(true));

      if (!response.ok) {
        throw createError({
          message: `HTTP ${response.status} for ${imageUrl}`,
          status: response.status,
          why: "Image URL returned non-OK status",
        });
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const url = new URL(imageUrl);
      const filename = path.basename(url.pathname);
      const contentType = response.headers.get("content-type");

      if (!contentType || !contentType.startsWith("image/")) {
        throw createError({
          message: "URL does not point to a valid image content type",
          why: `Response content-type was "${contentType ?? "null"}"`,
          fix: "Verify the image URL points to a valid image",
        });
      }

      const command = new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: filename,
        Body: imageBuffer,
        ContentType: contentType,
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

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
};

export const scrapeSingleItem = async ({
  id,
  log,
  maxRetries = 3,
  baseDelayMs = 1000,
  jobId,
  overallIndex,
  totalItems,
}: ScrapeSingleItemParams): Promise<ScrapedItem | null> => {
  await setJobStatus({
    redis,
    jobId,
    statusMessage: `Syncing...${overallIndex + 1}/${totalItems}`,
    finished: false,
  });

  const attemptErrors: string[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
      const classification: Array<{ id: number; name: string; role: string }> = [];
      const version: string[] = [];
      let scale = "";
      let height = 0;
      let width = 0;
      let depth = 0;
      const origin: Array<{ id: number; name: string }> = [];
      const character: Array<{ id: number; name: string }> = [];
      const company: Array<{ id: number; name: string; role: string }> = [];
      const artist: Array<{ id: number; name: string; role: string }> = [];
      let releaseDate: Array<{
        date: string;
        type: string;
        price: number;
        priceCurrency: string;
        barcode: string;
      }> = [];
      const event: Array<{ id: number; name: string; role: string }> = [];
      const materials: Array<{ id: number; name: string }> = [];

      const dataFields = $(".data-field");

      for (let i = 0; i < dataFields.length; i++) {
        const $element = $(dataFields[i]);
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
        const imageResponse = await scrapeImage({ imageUrl, log, maxRetries, baseDelayMs });
        if (!imageResponse || imageResponse === null) {
          throw createError({
            message: `Failed to scrape image for item ${id}`,
            why: "Image scrape returned null after all retries",
          });
        }
        image = imageResponse;
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

      return scrapedItem;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attemptErrors.push(message);

      if (attempt === maxRetries) {
        log.warn(`Item ${id} failed after ${maxRetries} attempts`);
        const finalError = error instanceof Error ? error : new Error(String(error));
        (finalError as Error & { attemptErrors: string[] }).attemptErrors = attemptErrors;
        throw finalError;
      }

      log.warn(`Item ${id} attempt ${attempt}/${maxRetries} failed: ${message}`);

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
};

export const scrapeItems = async ({
  itemIds,
  log,
  maxRetries = 3,
  baseDelayMs = 1000,
  jobId,
  startingIndex = 0,
  totalItems = itemIds.length,
}: ScrapeItemsParams): Promise<ScrapeResult> => {
  const promises = itemIds.map((id, index) =>
    scrapeSingleItem({
      id,
      log,
      maxRetries,
      baseDelayMs,
      jobId,
      overallIndex: startingIndex + index,
      totalItems,
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
  jobId,
}: Omit<ScrapeItemsParams, "startingIndex" | "totalItems">): Promise<ScrapeResult> => {
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
      jobId,
      startingIndex: i,
      totalItems: itemIds.length,
    });
    allSuccessful.push(...successful);
    allFailures.push(...failures);

    if (i + batchSize < itemIds.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
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
