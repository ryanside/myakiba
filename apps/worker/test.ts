import * as cheerio from "cheerio";
import { db } from "@myakiba/db";
import { entry, entry_to_item, item, item_release } from "@myakiba/db/schema/figure";
import { and, eq, inArray } from "drizzle-orm";
import Redis from "ioredis";
import path from "path";
import { URL } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  extractArrayData,
  extractArrayDataWithIds,
  extractEntitiesWithRoles,
  extractDimensions,
  extractReleaseData,
  extractMaterialsData,
} from "./lib/extract";
import { createFetchOptions, normalizeDateString } from "./lib/utils";
import { v5 as uuidv5 } from "uuid";
import type { scrapedItem } from "./lib/types";
import { env } from "@myakiba/env/worker";
import type { Category } from "@myakiba/types";
import { CATEGORIES } from "@myakiba/constants";

const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
});

const s3Client = new S3Client({
  region: env.AWS_BUCKET_REGION,
});

const scrapeImage = async (
  imageUrl: string,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
) => {
  console.time("Scraping Image Duration");
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Scraping image ${imageUrl} (attempt ${attempt}/${maxRetries})`);
      const response = await fetch(imageUrl, createFetchOptions(true));

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${imageUrl}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      const url = new URL(imageUrl);
      const filename = path.basename(url.pathname);
      const contentType = response.headers.get("content-type");

      if (!contentType || !contentType.startsWith("image/")) {
        throw new Error("URL does not point to a valid image content type.");
      }
      console.log(`Detected filename: ${filename}`);
      console.log(`Detected content-type: ${contentType}`);

      console.log("Uploading to S3...");
      const command = new PutObjectCommand({
        Bucket: env.AWS_BUCKET_NAME,
        Key: filename,
        Body: imageBuffer,
        ContentType: contentType,
      });
      const uploadResult = await s3Client.send(command);

      if (uploadResult.$metadata.httpStatusCode !== 200) {
        throw new Error("Failed to upload image to S3");
      }

      const imageS3Url = `https://${env.AWS_BUCKET_NAME}.s3.${env.AWS_BUCKET_REGION}.amazonaws.com/${filename}`;
      console.timeEnd("Scraping Image Duration");

      return imageS3Url;
    } catch (error) {
      console.error(`Error scraping image ${imageUrl} (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt === maxRetries) {
        console.error(`Failed to scrape image ${imageUrl} after ${maxRetries} attempts`);
        throw error;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`Retrying image ${imageUrl} in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
};

const scrapeSingleItem = async (
  id: number,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  userId: string,
  jobId?: string,
  overallIndex: number = 0,
  totalItems: number = 1,
): Promise<scrapedItem | null> => {
  console.time("Scraping Duration");
  console.log(`Processing item ${overallIndex + 1}/${totalItems}`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://myfigurecollection.net/item/${id}`;
      console.log(`Scraping ID ${id} (attempt ${attempt}/${maxRetries})`);

      const response = await fetch(url, createFetchOptions());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ID ${id}`);
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
        throw new Error(`Invalid or missing category for ID ${id}`);
      }

      let image = "";
      const imageElement = $(".item-picture img").first();
      const imageUrl = imageElement.attr("src");

      if (imageUrl) {
        console.log(`Scraping image for ID ${id}`);
        const imageResponse = await scrapeImage(imageUrl, maxRetries, baseDelayMs);
        if (!imageResponse || imageResponse === null) {
          throw new Error(`Failed to scrape image for ID ${id}`);
        }
        console.log(`Successfully scraped image for ID ${id}`);
        image = imageResponse;
      }

      const scrapedItem: scrapedItem = {
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

      console.log(`Successfully scraped ID ${id} on attempt ${attempt}`);
      console.timeEnd("Scraping Duration");

      return scrapedItem;
    } catch (error) {
      console.error(`Error scraping item ${id} (attempt ${attempt}/${maxRetries}):`, error);

      if (attempt === maxRetries) {
        console.error(`Failed to scrape ID ${id} after ${maxRetries} attempts`);
        throw error;
      }

      // Calculate exponential backoff delay: 1s, 2s, 4s, 8s...
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`Retrying ID ${id} in ${delayMs}ms...`);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
};

const scrapedItems = async (
  itemIds: number[],
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  userId: string,
  jobId?: string,
  startingIndex: number = 0,
  totalItems: number = itemIds.length,
): Promise<scrapedItem[]> => {
  console.time("Scraping Duration");

  console.log(`Starting to scrape ${itemIds.length} items with up to ${maxRetries} retries each`);

  const promises = itemIds.map((id, index) =>
    scrapeSingleItem(id, maxRetries, baseDelayMs, userId, jobId, startingIndex + index, totalItems),
  );
  const results = await Promise.allSettled(promises);

  // Filter out failed requests and extract successful results
  const successfulResults = results
    .filter(
      (result): result is PromiseFulfilledResult<scrapedItem> =>
        result.status === "fulfilled" && result.value !== null,
    )
    .map((result) => result.value);

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    console.warn(`Failed to scrape ${failures.length} out of ${itemIds.length} items`);
  }

  console.timeEnd("Scraping Duration");

  console.log(`Successfully scraped ${successfulResults.length} out of ${itemIds.length} items`);

  return successfulResults;
};

// Rate-limited version for scraping many items
const scrapedItemsWithRateLimit = async (
  itemIds: number[],
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  userId: string,
  jobId?: string,
): Promise<scrapedItem[]> => {
  console.time("Rate-Limited Scraping Duration");
  const startTime = Date.now();

  const batchSize = 5;
  const delayMs = 2000;

  console.log(`Starting rate-limited scraping of ${itemIds.length} items`);

  console.log(`Batch size: ${batchSize}, Delay between batches: ${delayMs}ms`);

  console.log(`Max retries per item: ${maxRetries}, Base retry delay: ${baseDelayMs}ms`);

  const allResults: scrapedItem[] = [];
  const totalBatches = Math.ceil(itemIds.length / batchSize);

  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    console.log(
      `Processing batch ${batchNumber}/${totalBatches} (${
        batch.length
      } items): [${batch.join(", ")}]`,
    );

    const batchResults = await scrapedItems(
      batch,
      maxRetries,
      baseDelayMs,
      userId,
      jobId,
      i, // starting index for this batch
      itemIds.length, // total items across all batches
    );
    allResults.push(...batchResults);

    console.log(
      `Batch ${batchNumber} completed: ${batchResults.length}/${batch.length} successful`,
    );
    if (i + batchSize < itemIds.length) {
      console.log(`Waiting ${delayMs}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.timeEnd("Rate-Limited Scraping Duration");
  const endTime = Date.now();
  const duration = endTime - startTime;
  console.log(
    `Rate-limited scraping completed in ${duration}ms (${(duration / 1000).toFixed(2)}s)`,
  );
  console.log(`Successfully scraped ${allResults.length} out of ${itemIds.length} items`);
  console.log(`Average time per item: ${(duration / itemIds.length).toFixed(0)}ms`);
  return allResults;
};

const itemIds: number[] = [1049502];
const userId = "";

const scrapeMethod = itemIds.length <= 5 ? scrapedItems : scrapedItemsWithRateLimit;

scrapeMethod(itemIds, 3, 1000, userId, undefined).then(async (successfulResults) => {
  const items = successfulResults.map((item) => ({
    externalId: item.id,
    source: "mfc" as const,
    title: item.title,
    category: item.category as Category,
    version: item.version,
    scale: item.scale,
    height: item.height,
    width: item.width,
    depth: item.depth,
    image: item.image,
  }));

  const itemReleases: Array<{
    id: string;
    itemExternalId: number;
    date: string;
    type: string;
    price: string;
    priceCurrency: string;
    barcode: string;
  }> = [];
  const entries: Array<{
    externalId: number;
    source: "mfc";
    category: string;
    name: string;
  }> = [];
  const entryToItems: Array<{
    entryExternalId: number;
    itemExternalId: number;
    role: string;
  }> = [];

  for (const scraped of successfulResults) {
    for (const classification of scraped.classification) {
      entryToItems.push({
        entryExternalId: classification.id,
        itemExternalId: scraped.id,
        role: classification.role,
      });
      entries.push({
        externalId: classification.id,
        source: "mfc",
        category: "Classifications",
        name: classification.name,
      });
    }

    for (const origin of scraped.origin) {
      entryToItems.push({
        entryExternalId: origin.id,
        itemExternalId: scraped.id,
        role: "",
      });
      entries.push({
        externalId: origin.id,
        source: "mfc",
        category: "Origins",
        name: origin.name,
      });
    }

    for (const character of scraped.character) {
      entryToItems.push({
        entryExternalId: character.id,
        itemExternalId: scraped.id,
        role: "",
      });
      entries.push({
        externalId: character.id,
        source: "mfc",
        category: "Characters",
        name: character.name,
      });
    }

    for (const company of scraped.company) {
      entryToItems.push({
        entryExternalId: company.id,
        itemExternalId: scraped.id,
        role: company.role,
      });
      entries.push({
        externalId: company.id,
        source: "mfc",
        category: "Companies",
        name: company.name,
      });
    }

    for (const artist of scraped.artist) {
      entryToItems.push({
        entryExternalId: artist.id,
        itemExternalId: scraped.id,
        role: artist.role,
      });
      entries.push({
        externalId: artist.id,
        source: "mfc",
        category: "Artists",
        name: artist.name,
      });
    }

    for (const event of scraped.event) {
      entryToItems.push({
        entryExternalId: event.id,
        itemExternalId: scraped.id,
        role: event.role,
      });
      entries.push({
        externalId: event.id,
        source: "mfc",
        category: "Events",
        name: event.name,
      });
    }

    for (const material of scraped.materials) {
      entryToItems.push({
        entryExternalId: material.id,
        itemExternalId: scraped.id,
        role: "",
      });
      entries.push({
        externalId: material.id,
        source: "mfc",
        category: "Materials",
        name: material.name,
      });
    }

    for (const release of scraped.releaseDate) {
      itemReleases.push({
        id: uuidv5(
          `${scraped.id}-${normalizeDateString(release.date)}-${release.type}-${
            release.price
          }-${release.priceCurrency}-${release.barcode}`,
          "2c8ed313-3f54-4401-a280-2410ce639ef3",
        ),
        itemExternalId: scraped.id,
        date: normalizeDateString(release.date),
        type: release.type,
        price: release.price.toString(),
        priceCurrency: release.priceCurrency,
        barcode: release.barcode,
      });
    }
  }

  console.log("Items to be inserted:", items);
  console.log("Releases to be inserted:", itemReleases);
  console.log("Entries to be inserted:", entries);
  console.log("Entry to Items to be inserted:", entryToItems);

  const batchInsert = await db.transaction(async (tx) => {
    if (items.length > 0) {
      await tx
        .insert(item)
        .values(items)
        .onConflictDoNothing({ target: [item.source, item.externalId] });
    }

    const itemExternalIds = items
      .map((dbItem) => dbItem.externalId)
      .filter((externalId): externalId is number => externalId !== null);
    const dbItems =
      itemExternalIds.length > 0
        ? await tx
            .select({ id: item.id, externalId: item.externalId })
            .from(item)
            .where(and(eq(item.source, "mfc"), inArray(item.externalId, itemExternalIds)))
        : [];
    const externalIdToInternalId = new Map(dbItems.map((dbItem) => [dbItem.externalId, dbItem.id]));

    if (entries.length > 0) {
      await tx
        .insert(entry)
        .values(entries)
        .onConflictDoNothing({ target: [entry.source, entry.externalId] });
    }

    const entryExternalIds = entries
      .map((dbEntry) => dbEntry.externalId)
      .filter((externalId): externalId is number => externalId !== null);
    const dbEntries =
      entryExternalIds.length > 0
        ? await tx
            .select({ id: entry.id, externalId: entry.externalId })
            .from(entry)
            .where(and(eq(entry.source, "mfc"), inArray(entry.externalId, entryExternalIds)))
        : [];
    const externalIdToEntryId = new Map(
      dbEntries.map((dbEntry) => [dbEntry.externalId, dbEntry.id]),
    );

    const itemReleasesToInsert = itemReleases
      .map((release) => {
        const internalItemId = externalIdToInternalId.get(release.itemExternalId);
        if (!internalItemId) {
          return null;
        }
        return {
          id: release.id,
          itemId: internalItemId,
          date: release.date,
          type: release.type,
          price: release.price,
          priceCurrency: release.priceCurrency,
          barcode: release.barcode,
        };
      })
      .filter(
        (
          release,
        ): release is {
          id: string;
          itemId: string;
          date: string;
          type: string;
          price: string;
          priceCurrency: string;
          barcode: string;
        } => release !== null,
      );

    if (itemReleasesToInsert.length > 0) {
      await tx
        .insert(item_release)
        .values(itemReleasesToInsert)
        .onConflictDoNothing({ target: [item_release.id] });
    }

    const entryToItemsToInsert = entryToItems
      .map((link) => {
        const entryId = externalIdToEntryId.get(link.entryExternalId);
        const itemId = externalIdToInternalId.get(link.itemExternalId);
        if (!entryId || !itemId) {
          return null;
        }
        return {
          entryId,
          itemId,
          role: link.role,
        };
      })
      .filter(
        (
          link,
        ): link is {
          entryId: string;
          itemId: string;
          role: string;
        } => link !== null,
      );

    if (entryToItemsToInsert.length > 0) {
      await tx
        .insert(entry_to_item)
        .values(entryToItemsToInsert)
        .onConflictDoNothing({
          target: [entry_to_item.entryId, entry_to_item.itemId],
        });
    }
  });
  console.log(batchInsert);
  await redis.quit();

  return;
});
