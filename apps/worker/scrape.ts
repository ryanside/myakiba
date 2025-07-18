import * as cheerio from "cheerio";
import { Worker } from "bullmq";

const myWorker = new Worker(
  "myqueue",
  async (job) => {
    console.log("🎯 Worker: Processing job", job.name, "with data:", job.data);

    // Add your job processing logic here
    // For now, just simulate some work
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log("✅ Worker: Job completed successfully");
    return { status: "completed", processedAt: new Date().toISOString() };
  },
  {
    connection: {},
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
});

myWorker.on("completed", (job, result) => {
  console.log("🎉 Job completed:", job.name, "Result:", result);
});

// Log connection details (without sensitive data)
console.log("🔧 Worker configuration:");
console.log("  - Queue name: myqueue");
console.log("  - Redis host:", process.env.UPSTASH_REDIS_ENDPOINT);
console.log("  - Redis port: 6379");
console.log("  - Has password:", !!process.env.UPSTASH_REDIS_PASSWORD);

interface scrapedFigure {
  id: number;
  title: string;
  category: string;
  classification: string;
  origin: string[];
  character: string[];
  company: {
    name: string;
    role: string;
  }[];
  artist: {
    name: string;
    role: string;
  }[];
  version: string;
  releaseDate: {
    date: string;
    type: string; // whatever comes after "as"
    price: number;
    barcode: number;
  }[];
  materials: string[];
  scale: string;
  height: number;
  width: number;
  depth: number;
  image: string;
}

// Pre-compile regex patterns for better performance
const REGEX_PATTERNS = {
  height: /H=(\d+)mm/,
  width: /W=(\d+)mm/,
  depth: /D=(\d+)mm/,
  price: /(\d{1,3}(?:,\d{3})*)\s+JPY/,
  barcode: /(\d{13})/,
  typeEnd: /\d{2,}|•|JPY/,
  trailingSpace: /\s+$/,
} as const;

// Optimized fetch configuration
const createFetchOptions = (): any => ({
  proxy: process.env.PROXY_URL,
  tls: {
    rejectUnauthorized: false,
  },
  // Add timeout to prevent hanging requests
  signal: AbortSignal.timeout(10000), // 10 second timeout
});

// Optimized data extraction functions
const extractArrayData = (
  $element: cheerio.Cheerio<any>,
  selector: string
): string[] => {
  const items: string[] = [];
  $element.find(selector).each((_, span) => {
    const text = cheerio.load(span).text().trim();
    if (text) items.push(text);
  });
  return items;
};

const extractCompanyData = (
  $element: cheerio.Cheerio<any>
): Array<{ name: string; role: string }> => {
  const companies: Array<{ name: string; role: string }> = [];
  $element.find(".item-entries").each((_, entry) => {
    const $entry = cheerio.load(entry);
    const name = $entry("span[switch]").text().trim();
    const roleText = $entry("small.light em").text().trim();
    if (name && roleText) {
      companies.push({ name, role: roleText });
    }
  });
  return companies;
};

const extractDimensions = (
  dimensionText: string,
  $element: cheerio.Cheerio<any>
) => {
  let scale = "";
  let height = 0;
  let width = 0;
  let depth = 0;

  // Extract scale
  const scaleElement = $element.find("a.item-scale");
  if (scaleElement.length > 0) {
    scale = scaleElement.text().trim();
  }

  // Extract dimensions using pre-compiled regex
  const heightMatch = dimensionText.match(REGEX_PATTERNS.height);
  if (heightMatch) height = parseInt(heightMatch[1], 10);

  const widthMatch = dimensionText.match(REGEX_PATTERNS.width);
  if (widthMatch) width = parseInt(widthMatch[1], 10);

  const depthMatch = dimensionText.match(REGEX_PATTERNS.depth);
  if (depthMatch) depth = parseInt(depthMatch[1], 10);

  return { scale, height, width, depth };
};

const extractReleaseData = (
  $element: cheerio.Cheerio<any>,
  $: cheerio.CheerioAPI
) => {
  const releaseDate: Array<{
    date: string;
    type: string;
    price: number;
    barcode: number;
  }> = [];

  // Find ALL release fields more efficiently
  const allReleaseFields = $element.add(
    $element.nextAll(".data-field").filter((_, field) => {
      const $field = $(field);
      return (
        $field.find(".data-label").length === 0 ||
        $field.hasClass("item-extra-release")
      );
    })
  );

  allReleaseFields.each((_, releaseField) => {
    const $releaseField = $(releaseField);
    const dateElement = $releaseField.find("a.time");

    if (dateElement.length > 0) {
      const date = dateElement.text().trim();
      const valueText = $releaseField.find(".data-value").text();

      // Extract type using optimized string operations
      let type = "";
      const asIndex = valueText.indexOf(" as ");
      if (asIndex !== -1) {
        const afterAs = valueText.substring(asIndex + 4);
        let typeEnd = afterAs.search(REGEX_PATTERNS.typeEnd);
        if (typeEnd === -1) typeEnd = afterAs.length;

        type = afterAs
          .substring(0, typeEnd)
          .replace(REGEX_PATTERNS.trailingSpace, "");
      }

      // Extract price and barcode using pre-compiled regex
      const priceMatch = valueText.match(REGEX_PATTERNS.price);
      const price = priceMatch
        ? parseInt(priceMatch[1].replace(/,/g, ""), 10)
        : 0;

      const barcodeMatch = valueText.match(REGEX_PATTERNS.barcode);
      const barcode = barcodeMatch ? parseInt(barcodeMatch[1], 10) : 0;

      releaseDate.push({ date, type, price, barcode });
    }
  });

  return releaseDate;
};

const scrapeSingleFigure = async (
  id: number,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<scrapedFigure | null> => {
  console.time("Scraping Duration");
  const startTime = Date.now();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://myfigurecollection.net/item/${id}`;
      console.log(`Scraping ID ${id} (attempt ${attempt}/${maxRetries})`);

      // Use optimized fetch configuration
      const response = await fetch(url, createFetchOptions());

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ID ${id}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract title once
      const title = $("h1.title").text().trim();

      // Initialize data containers
      let category = "";
      let classification = "";
      let version = "";
      let scale = "";
      let height = 0;
      let width = 0;
      let depth = 0;
      const origin: string[] = [];
      const character: string[] = [];
      const company: Array<{ name: string; role: string }> = [];
      const artist: Array<{ name: string; role: string }> = [];
      let releaseDate: Array<{
        date: string;
        type: string;
        price: number;
        barcode: number;
      }> = [];
      const materials: string[] = [];

      // Optimized data extraction - single pass through .data-field elements
      const dataFields = $(".data-field");

      dataFields.each((_, element) => {
        const $element = $(element);
        const label = $element.find(".data-label").text().trim();

        switch (label) {
          case "Category":
            category = $element.find("span").text().trim();
            break;
          case "Classification":
            classification = $element.find("span").text().trim();
            break;
          case "Origin":
          case "Origins":
            origin.push(
              ...extractArrayData($element, ".item-entry span[switch]")
            );
            break;
          case "Character":
          case "Characters":
            character.push(
              ...extractArrayData($element, ".item-entry span[switch]")
            );
            break;
          case "Company":
          case "Companies":
            company.push(...extractCompanyData($element));
            break;
          case "Artist":
          case "Artists":
            artist.push(...extractCompanyData($element));
            break;
          case "Version":
            version = $element.find("a").text().trim();
            break;
          case "Materials":
            materials.push(
              ...extractArrayData($element, ".item-entry span[switch]")
            );
            break;
          case "Dimensions": {
            const dimensionText = $element.find(".data-value").text().trim();
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
      });

      const imageElement = $(
        "img.item-image, .item-main-image img, .item-picture img"
      ).first();
      const imageUrl = imageElement.attr("src");
      const image = imageUrl
        ? `https://static.myfigurecollection.net/upload/items/2/${imageUrl
            .split("/")
            .pop()}`
        : "";

      const scrapedFigure: scrapedFigure = {
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
        materials,
        scale,
        height,
        width,
        depth,
        image,
      };

      console.log(`✅ Successfully scraped ID ${id} on attempt ${attempt}`);
      console.timeEnd("Scraping Duration");
      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(
        `\n🎉 Scraping completed in ${duration}ms (${(duration / 1000).toFixed(
          2
        )}s)`
      );
      return scrapedFigure;
    } catch (error) {
      console.error(
        `❌ Error scraping figure ${id} (attempt ${attempt}/${maxRetries}):`,
        error
      );

      // If this is the last attempt, give up
      if (attempt === maxRetries) {
        console.error(
          `🚫 Failed to scrape ID ${id} after ${maxRetries} attempts`
        );
        return null;
      }

      // Calculate exponential backoff delay: 1s, 2s, 4s, 8s...
      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      console.log(`⏳ Retrying ID ${id} in ${delayMs}ms...`);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
};

// Optimized function to scrape multiple figures in parallel
const scrapedFigures = async (
  figureIds: number[],
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<scrapedFigure[]> => {
  console.time("Scraping Duration");
  const startTime = Date.now();

  console.log(
    `🚀 Starting to scrape ${figureIds.length} figures with up to ${maxRetries} retries each`
  );

  // MAJOR PERFORMANCE IMPROVEMENT: Process all figures in parallel
  const promises = figureIds.map((id) =>
    scrapeSingleFigure(id, maxRetries, baseDelayMs)
  );
  const results = await Promise.allSettled(promises);

  // Filter out failed requests and extract successful results
  const successfulResults = results
    .filter(
      (result): result is PromiseFulfilledResult<scrapedFigure> =>
        result.status === "fulfilled" && result.value !== null
    )
    .map((result) => result.value);

  // Log any failures
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    console.warn(
      `⚠️  Failed to scrape ${failures.length} out of ${figureIds.length} figures`
    );
  }

  // End timer and show duration
  console.timeEnd("Scraping Duration");
  const endTime = Date.now();
  const duration = endTime - startTime;
  console.log(
    `\n🎉 Scraping completed in ${duration}ms (${(duration / 1000).toFixed(
      2
    )}s)`
  );
  console.log(
    `📊 Successfully scraped ${successfulResults.length} out of ${figureIds.length} figures`
  );

  return successfulResults;
};

// Rate-limited version for scraping many items responsibly
const scrapedFiguresWithRateLimit = async (
  figureIds: number[],
  batchSize: number = 5,
  delayMs: number = 2000,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<scrapedFigure[]> => {
  console.time("Rate-Limited Scraping Duration");
  const startTime = Date.now();

  console.log(
    `🚀 Starting rate-limited scraping of ${figureIds.length} figures`
  );
  console.log(
    `📦 Batch size: ${batchSize}, Delay between batches: ${delayMs}ms`
  );
  console.log(
    `🔄 Max retries per figure: ${maxRetries}, Base retry delay: ${baseDelayMs}ms`
  );

  const allResults: scrapedFigure[] = [];
  const totalBatches = Math.ceil(figureIds.length / batchSize);

  // Process in batches to avoid overwhelming the server
  for (let i = 0; i < figureIds.length; i += batchSize) {
    const batch = figureIds.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;

    console.log(
      `\n📋 Processing batch ${batchNumber}/${totalBatches} (${
        batch.length
      } items): [${batch.join(", ")}]`
    );

    // Use the optimized scrapedFigures function for each batch
    const batchResults = await scrapedFigures(batch, maxRetries, baseDelayMs);
    allResults.push(...batchResults);

    console.log(
      `✅ Batch ${batchNumber} completed: ${batchResults.length}/${batch.length} successful`
    );

    // Add delay between batches (except for the last batch)
    if (i + batchSize < figureIds.length) {
      console.log(`⏳ Waiting ${delayMs}ms before next batch...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.timeEnd("Rate-Limited Scraping Duration");
  const endTime = Date.now();
  const duration = endTime - startTime;
  console.log(
    `\n🎉 Rate-limited scraping completed in ${duration}ms (${(
      duration / 1000
    ).toFixed(2)}s)`
  );
  console.log(
    `📊 Successfully scraped ${allResults.length} out of ${figureIds.length} figures`
  );
  console.log(
    `⚡ Average time per figure: ${(duration / figureIds.length).toFixed(0)}ms`
  );

  return allResults;
};

// const figureIds: number[] = [
//   98665, 166816, 998271, 1220599, 604194, 520673, 216860, 1605170, 1118541,
//   1780786,
// ];

// // Choose the appropriate scraping method based on the number of items
// const scrapeMethod =
//   figureIds.length <= 5 ? scrapedFigures : scrapedFiguresWithRateLimit;

// // Configuration examples:

// // For small batches (≤5 items) - Full parallel processing:
// // scrapedFigures(figureIds, 3, 1000)  // 3 retries, 1s base delay

// // For large batches (>5 items) - Rate-limited with parallel batches:
// // scrapedFiguresWithRateLimit(figureIds, 5, 2000, 3, 1000)
// // Parameters: (ids, batchSize, delayBetweenBatches, maxRetries, baseRetryDelay)

// // Conservative approach (slow but reliable):
// // scrapedFiguresWithRateLimit(figureIds, 3, 3000, 5, 2000)

// // Aggressive approach (faster but may hit rate limits):
// // scrapedFiguresWithRateLimit(figureIds, 10, 1000, 2, 500)

// scrapeMethod(figureIds).then((figures) => {
//   console.log("Scraped Figure Data:");
//   console.log(figures);
// });
