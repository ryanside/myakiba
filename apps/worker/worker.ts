import * as cheerio from "cheerio";
import { Job, Worker } from "bullmq";
import { db } from "./db";
import {
  entry,
  entry_to_item,
  item,
  item_release,
  collection,
} from "./db/schema/figure";
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
import {
  sanitizeDate,
  createFetchOptions,
  normalizeDateString,
} from "./lib/utils";

const redis = new Redis({
  host: process.env.NODE_ENV === "production" ? process.env.REDIS_HOST : "localhost",
  port: process.env.NODE_ENV === "production" ? parseInt(process.env.REDIS_PORT!) : 6379,
});
const s3Client = new S3Client({
  region: process.env.AWS_BUCKET_REGION,
});

interface jobData extends Job {
  data: {
    userId: string;
    items: {
      id: number;
      status: string;
      count: number;
      score: number;
      payment_date: string;
      shipping_date: string;
      collecting_date: string;
      price: number;
      shop: string;
      shipping_method: string;
      tracking_number: string;
      note: string;
    }[];
  };
}

const myWorker = new Worker(
  "sync-queue",
  async (job: jobData) => {
    const userId = job.data.userId;
    console.log("🎯 Worker: Processing job", job.name);
    console.log("🎯 Worker: Job ID", job.id);
    console.log("🎯 Worker: Items", job.data.items);
    console.log("🎯 Worker: UserId", job.data.userId);

    const scrapeMethod =
      job.data.items.length <= 5 ? scrapedItems : scrapedItemsWithRateLimit;

    const itemIds = job.data.items.map((item) => item.id);

    await setJobStatus(
      job.id!,
      `Starting to sync ${itemIds.length} items`,
      false
    );

    scrapeMethod(itemIds, 3, 1000, userId, job.id!).then(
      async (successfulResults) => {
        if (successfulResults.length === 0) {
          await setJobStatus(
            job.id!,
            `Sync failed: Failed to scrape any items`,
            true
          );
          throw new Error("Failed to scrape any items.");
        }

        const items = successfulResults.map((item) => ({
          id: item.id,
          title: item.title,
          category: item.category,
          version: item.version,
          scale: item.scale,
          height: item.height,
          width: item.width,
          depth: item.depth,
          image: item.image,
        }));

        const itemReleases = [];
        const entries = [];
        const entryToItems = [];
        const successfulCollectionItems = job.data.items.filter((item) =>
          successfulResults.some((result) => result.id === item.id)
        );
        const collectionItems = successfulCollectionItems.map((item) => ({
          userId: userId,
          itemId: item.id,
          status: item.status,
          count: item.count,
          score: item.score,
          paymentDate: sanitizeDate(item.payment_date),
          shippingDate: sanitizeDate(item.shipping_date),
          collectionDate: sanitizeDate(item.collecting_date),
          price: item.price.toString(),
          shop: item.shop,
          shippingMethod: item.shipping_method,
          notes: item.note,
        }));

        for (const item of successfulResults) {
          for (const classification of item.classification) {
            entryToItems.push({
              entryId: classification.id,
              itemId: item.id,
              role: classification.role,
            });
            entries.push({
              id: classification.id,
              category: "Classifications",
              name: classification.name,
            });
          }

          for (const origin of item.origin) {
            entryToItems.push({
              entryId: origin.id,
              itemId: item.id,
              role: "",
            });
            entries.push({
              id: origin.id,
              category: "Origins",
              name: origin.name,
            });
          }

          for (const character of item.character) {
            entryToItems.push({
              entryId: character.id,
              itemId: item.id,
              role: "",
            });
            entries.push({
              id: character.id,
              category: "Characters",
              name: character.name,
            });
          }

          for (const company of item.company) {
            entryToItems.push({
              entryId: company.id,
              itemId: item.id,
              role: company.role,
            });
            entries.push({
              id: company.id,
              category: "Companies",
              name: company.name,
            });
          }

          for (const artist of item.artist) {
            entryToItems.push({
              entryId: artist.id,
              itemId: item.id,
              role: artist.role,
            });
            entries.push({
              id: artist.id,
              category: "Artists",
              name: artist.name,
            });
          }

          for (const event of item.event) {
            entryToItems.push({
              entryId: event.id,
              itemId: item.id,
              role: event.role,
            });
            entries.push({
              id: event.id,
              category: "Events",
              name: event.name,
            });
          }

          for (const material of item.materials) {
            entryToItems.push({
              entryId: material.id,
              itemId: item.id,
              role: "",
            });
            entries.push({
              id: material.id,
              category: "Materials",
              name: material.name,
            });
          }

          for (const release of item.releaseDate) {
            itemReleases.push({
              itemId: item.id,
              date: normalizeDateString(release.date),
              type: release.type,
              price: release.price.toString(),
              priceCurrency: release.priceCurrency,
              barcode: release.barcode,
            });
          }
        }

        console.log("Items to be inserted:", items);
        // console.log("Releases to be inserted:", itemReleases);
        // console.log("Entries to be inserted:", entries);
        // console.log("Entry to Items to be inserted:", entryToItems);
        // console.log("Collection Items to be inserted:", collectionItems);

        try {
          const batchInsert = await db.batch([
            db
              .insert(item)
              .values(items)
              .onConflictDoNothing({ target: [item.id] }),
            db
              .insert(item_release)
              .values(itemReleases)
              .onConflictDoNothing({ target: [item_release.id] }),
            db
              .insert(entry)
              .values(entries)
              .onConflictDoNothing({ target: [entry.id] }),
            db
              .insert(entry_to_item)
              .values(entryToItems)
              .onConflictDoNothing({
                target: [entry_to_item.entryId, entry_to_item.itemId],
              }),
            db.insert(collection).values(collectionItems),
          ]);
          // console.log(batchInsert);
        } catch (error) {
          await setJobStatus(
            job.id!,
            `Sync failed: Failed to insert items to database.`,
            true
          );
          throw new Error("Failed to batch insert items to database.");
        }

        await setJobStatus(
          job.id!,
          `Sync completed: Successfully synced ${successfulResults.length} out of ${itemIds.length} items`,
          true
        );
        return {
          status: "Sync Job completed",
          processedAt: new Date().toISOString(),
        };
      }
    );
  },
  {
    connection: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
    },
    concurrency: 2,
  }
);

// Add event listeners for better debugging
myWorker.on("ready", () => {
  console.log("🚀 Worker is ready and connected to Redis");
});

myWorker.on("error", (error) => {
  console.error("❌ Worker error:", error);
});

myWorker.on("failed", (job, err) => {
  console.error("💥 Job failed:", job?.name, "Error:", err);
  if (job) {
    setJobStatus(job.id!, `Job failed: ${err}`, true);
  }
});

myWorker.on("completed", (job, result) => {
  console.log("🎉 Job completed:", job.name, "Result:", result);
});

// Log connection details (without sensitive data)
console.log("🔧 Worker configuration:");
console.log("  - Queue name: sync-queue");
console.log("  - Redis host:", process.env.REDIS_HOST);
console.log("  - Redis port: 6379");
console.log("  - Has password:", !!process.env.REDIS_PASSWORD);

interface scrapedItem {
  id: number;
  title: string;
  category: string;
  classification: {
    id: number;
    name: string;
    role: string;
  }[];
  origin: {
    id: number;
    name: string;
  }[];
  character: {
    id: number;
    name: string;
  }[];
  company: {
    id: number;
    name: string;
    role: string;
  }[];
  artist: {
    id: number;
    name: string;
    role: string;
  }[];
  version: string[];
  releaseDate: {
    date: string;
    type: string;
    price: number;
    priceCurrency: string;
    barcode: string;
  }[];
  event: {
    id: number;
    name: string;
    role: string;
  }[];
  materials: {
    id: number;
    name: string;
  }[];
  scale: string;
  height: number;
  width: number;
  depth: number;
  image: string;
}

const setJobStatus = async (
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

const scrapeImage = async (
  imageUrl: string,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
) => {
  console.time("Scraping Image Duration");
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `Scraping image ${imageUrl} (attempt ${attempt}/${maxRetries})`
      );
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
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: filename,
        Body: imageBuffer,
        ContentType: contentType,
      });
      const uploadResult = await s3Client.send(command);

      if (uploadResult.$metadata.httpStatusCode !== 200) {
        throw new Error("Failed to upload image to S3");
      }

      const imageS3Url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_BUCKET_REGION}.amazonaws.com/${filename}`;
      console.timeEnd("Scraping Image Duration");

      return imageS3Url;
    } catch (error) {
      console.error(
        `Error scraping image ${imageUrl} (attempt ${attempt}/${maxRetries}):`,
        error
      );

      if (attempt === maxRetries) {
        console.error(
          `Failed to scrape image ${imageUrl} after ${maxRetries} attempts`
        );
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
  jobId: string,
  overallIndex: number,
  totalItems: number
): Promise<scrapedItem | null> => {
  console.time("Scraping Duration");
  await setJobStatus(
    jobId,
    `Syncing...${overallIndex + 1}/${totalItems}`,
    false
  );

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

      let category = "";
      let classification: Array<{ id: number; name: string; role: string }> =
        [];
      let version: string[] = [];
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
      let event: Array<{ id: number; name: string; role: string }> = [];
      const materials: Array<{ id: number; name: string }> = [];

      const dataFields = $(".data-field");

      for (let i = 0; i < dataFields.length; i++) {
        const $element = $(dataFields[i]);
        const $label = $element.find(".data-label");
        const label = $label.text().trim();

        const $dataValue = $element.find(".data-value");
        const $itemEntries = $element.find(".item-entries");

        switch (label) {
          case "Category":
            category = $element.find("span").text().trim();
            break;
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

      let image = "";
      const imageElement = $(".item-picture img").first();
      const imageUrl = imageElement.attr("src");

      if (imageUrl) {
        console.log(`Scraping image for ID ${id}`);
        const imageResponse = await scrapeImage(
          imageUrl,
          maxRetries,
          baseDelayMs
        );
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
      console.error(
        `Error scraping item ${id} (attempt ${attempt}/${maxRetries}):`,
        error
      );

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
  jobId: string,
  startingIndex: number = 0,
  totalItems: number = itemIds.length
): Promise<scrapedItem[]> => {
  console.time("Scraping Duration");

  console.log(
    `Starting to scrape ${itemIds.length} items with up to ${maxRetries} retries each`
  );

  const promises = itemIds.map((id, index) =>
    scrapeSingleItem(
      id,
      maxRetries,
      baseDelayMs,
      userId,
      jobId,
      startingIndex + index,
      totalItems
    )
  );
  const results = await Promise.allSettled(promises);

  // Filter out failed requests and extract successful results
  const successfulResults = results
    .filter(
      (result): result is PromiseFulfilledResult<scrapedItem> =>
        result.status === "fulfilled" && result.value !== null
    )
    .map((result) => result.value);

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    console.warn(
      `Failed to scrape ${failures.length} out of ${itemIds.length} items`
    );
  }

  console.timeEnd("Scraping Duration");

  console.log(
    `Successfully scraped ${successfulResults.length} out of ${itemIds.length} items`
  );
  return successfulResults;
};

// Rate-limited version for scraping many items
const scrapedItemsWithRateLimit = async (
  itemIds: number[],
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  userId: string,
  jobId: string
): Promise<scrapedItem[]> => {
  console.time("Rate-Limited Scraping Duration");
  const startTime = Date.now();

  const batchSize = 5;
  const delayMs = 2000;

  console.log(`Starting rate-limited scraping of ${itemIds.length} items`);

  console.log(`Batch size: ${batchSize}, Delay between batches: ${delayMs}ms`);

  console.log(
    `Max retries per item: ${maxRetries}, Base retry delay: ${baseDelayMs}ms`
  );

  const allResults: scrapedItem[] = [];
  const totalBatches = Math.ceil(itemIds.length / batchSize);

  for (let i = 0; i < itemIds.length; i += batchSize) {
    const batch = itemIds.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    console.log(
      `Processing batch ${batchNumber}/${totalBatches} (${batch.length} items): [${batch.join(", ")}]`
    );

    const batchResults = await scrapedItems(
      batch,
      maxRetries,
      baseDelayMs,
      userId,
      jobId,
      i, // starting index for this batch
      itemIds.length // total items across all batches
    );
    allResults.push(...batchResults);

    console.log(
      `Batch ${batchNumber} completed: ${batchResults.length}/${batch.length} successful`
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
    `Rate-limited scraping completed in ${duration}ms (${(duration / 1000).toFixed(2)}s)`
  );
  console.log(
    `Successfully scraped ${allResults.length} out of ${itemIds.length} items`
  );
  console.log(
    `Average time per item: ${(duration / itemIds.length).toFixed(0)}ms`
  );
  return allResults;
};
