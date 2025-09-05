import * as cheerio from "cheerio";
import { Job, Worker } from "bullmq";
import { db } from "./db";
import {
  entry,
  entry_to_item,
  item,
  item_release,
  collection,
  order,
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
import { createFetchOptions, normalizeDateString } from "./lib/utils";
import { v5 as uuidv5 } from "uuid";

const redis = new Redis({
  host:
    process.env.NODE_ENV === "production"
      ? process.env.REDIS_HOST
      : "localhost",
  port:
    process.env.NODE_ENV === "production"
      ? parseInt(process.env.REDIS_PORT!)
      : 6379,
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
      score: string;
      payment_date: string | null;
      shipping_date: string | null;
      collecting_date: string | null;
      price: string;
      shop: string;
      shipping_method: string;
      note: string;
      orderId: string | null;
      orderDate: string | null;
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
            `Sync failed: Failed to scrape any items. MFC might be down, or the MFC item IDs may be invalid.`,
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

        const itemReleases: Array<{
          id: string;
          itemId: number;
          date: string;
          type: string;
          price: string;
          priceCurrency: string;
          barcode: string;
        }> = [];
        const entries: Array<{
          id: number;
          category: string;
          name: string;
        }> = [];
        const entryToItems: Array<{
          entryId: number;
          itemId: number;
          role: string;
        }> = [];
        const latestReleaseIdByItem: Map<
          number,
          { releaseId: string | null; date: string | null }
        > = new Map();
        const successfulCollectionItems = job.data.items.filter((i) =>
          successfulResults.some((result) => result.id === i.id)
        );
        let collectionItems: Array<{
          userId: string;
          itemId: number;
          status: string;
          count: number;
          score: string;
          paymentDate: string | null;
          shippingDate: string | null;
          collectionDate: string | null;
          price: string;
          shop: string;
          shippingMethod: string;
          notes: string;
          releaseId?: string | null;
          orderId: string | null;
          orderDate: string | null;
        }> = [];
        let orders: Array<{
          id: string;
          userId: string;
          title: string;
          shop: string;
          orderDate: string | null;
          paymentDate: string | null;
          shippingDate: string | null;
          collectionDate: string | null;
          shippingMethod: string;
          releaseMonthYear: string | null;
        }> = [];

        for (const scraped of successfulResults) {
          for (const classification of scraped.classification) {
            entryToItems.push({
              entryId: classification.id,
              itemId: scraped.id,
              role: classification.role,
            });
            entries.push({
              id: classification.id,
              category: "Classifications",
              name: classification.name,
            });
          }

          for (const origin of scraped.origin) {
            entryToItems.push({
              entryId: origin.id,
              itemId: scraped.id,
              role: "",
            });
            entries.push({
              id: origin.id,
              category: "Origins",
              name: origin.name,
            });
          }

          for (const character of scraped.character) {
            entryToItems.push({
              entryId: character.id,
              itemId: scraped.id,
              role: "",
            });
            entries.push({
              id: character.id,
              category: "Characters",
              name: character.name,
            });
          }

          for (const company of scraped.company) {
            entryToItems.push({
              entryId: company.id,
              itemId: scraped.id,
              role: company.role,
            });
            entries.push({
              id: company.id,
              category: "Companies",
              name: company.name,
            });
          }

          for (const artist of scraped.artist) {
            entryToItems.push({
              entryId: artist.id,
              itemId: scraped.id,
              role: artist.role,
            });
            entries.push({
              id: artist.id,
              category: "Artists",
              name: artist.name,
            });
          }

          for (const event of scraped.event) {
            entryToItems.push({
              entryId: event.id,
              itemId: scraped.id,
              role: event.role,
            });
            entries.push({
              id: event.id,
              category: "Events",
              name: event.name,
            });
          }

          for (const material of scraped.materials) {
            entryToItems.push({
              entryId: material.id,
              itemId: scraped.id,
              role: "",
            });
            entries.push({
              id: material.id,
              category: "Materials",
              name: material.name,
            });
          }

          const releasesForItem = scraped.releaseDate.map((release) => {
            const normalizedDate = normalizeDateString(release.date);
            return {
              id: uuidv5(
                `${scraped.id}-${normalizedDate}-${release.type}-${release.price}-${release.priceCurrency}-${release.barcode}`,
                "2c8ed313-3f54-4401-a280-2410ce639ef3"
              ),
              itemId: scraped.id,
              date: normalizedDate,
              type: release.type,
              price: release.price.toString(),
              priceCurrency: release.priceCurrency,
              barcode: release.barcode,
            };
          });

          if (releasesForItem.length > 0) {
            const latest = [...releasesForItem].sort((a, b) =>
              a.date.localeCompare(b.date)
            )[releasesForItem.length - 1];
            latestReleaseIdByItem.set(scraped.id, {
              releaseId: latest.id,
              date: latest.date,
            });
          } else {
            latestReleaseIdByItem.set(scraped.id, {
              releaseId: null,
              date: null,
            });
          }

          itemReleases.push(...releasesForItem);
        }

        collectionItems = successfulCollectionItems.map((ci) => ({
          userId: userId,
          itemId: ci.id,
          status: ci.status,
          count: ci.count,
          score:
            ci.score && ci.score.trim() !== "" ? ci.score.toString() : "0.0",
          paymentDate: ci.payment_date,
          shippingDate: ci.shipping_date,
          collectionDate: ci.collecting_date,
          price:
            ci.price && ci.price.trim() !== "" ? ci.price.toString() : "0.00",
          shop: ci.shop,
          shippingMethod: ci.shipping_method,
          notes: ci.note,
          releaseId: latestReleaseIdByItem.get(ci.id)?.releaseId ?? null,
          orderId: ci.orderId,
          orderDate: ci.orderDate,
        }));

        orders = successfulCollectionItems
          .filter((ci) => ci.orderId !== null)
          .map((ci) => ({
            id: ci.orderId!,
            userId: userId,
            title:
              successfulResults.find((result) => result.id === ci.id)?.title ??
              `Order ${ci.orderId}`,
            shop: ci.shop,
            orderDate: ci.orderDate,
            paymentDate: ci.payment_date,
            shippingDate: ci.shipping_date,
            collectionDate: ci.collecting_date,
            shippingMethod: ci.shipping_method,
            releaseMonthYear: latestReleaseIdByItem.get(ci.id)?.date ?? null,
          }));

        console.log("Items to be inserted:", items);
        console.log("Releases to be inserted:", itemReleases);
        console.log("Entries to be inserted:", entries);
        console.log("Entry to Items to be inserted:", entryToItems);
        console.log("Collection Items to be inserted:", collectionItems);
        console.log("Orders to be inserted:", orders);

        try {
          await db.transaction(async (tx) => {
            await tx
              .insert(item)
              .values(items)
              .onConflictDoNothing({ target: [item.id] });
            if (itemReleases.length > 0) {
              await tx
                .insert(item_release)
                .values(itemReleases)
                .onConflictDoNothing({ target: [item_release.id] });
            }
            if (entries.length > 0) {
              await tx
                .insert(entry)
                .values(entries)
                .onConflictDoNothing({ target: [entry.id] });
            }
            if (entryToItems.length > 0) {
              await tx
                .insert(entry_to_item)
                .values(entryToItems)
                .onConflictDoNothing({
                  target: [entry_to_item.entryId, entry_to_item.itemId],
                });
            }
            if (orders.length > 0) {
              await tx.insert(order).values(orders);
            }
            await tx.insert(collection).values(collectionItems);
          });

          console.log("Successfully inserted data to database.");
        } catch (error) {
          await setJobStatus(
            job.id!,
            `Sync failed: Failed to insert items to database.`,
            true
          );
          console.error("Failed to insert data to database.", error);
          throw error;
        }

        await setJobStatus(
          job.id!,
          `Sync completed: Synced ${successfulResults.length} out of ${itemIds.length} items`,
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
      i,
      itemIds.length
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
