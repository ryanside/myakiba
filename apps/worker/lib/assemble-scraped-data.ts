import { log } from "evlog";
import { normalizeScrapedDate } from "@myakiba/utils/date-only";
import { MFC_ITEM_METADATA_VERSION } from "@myakiba/contracts/shared/constants";
import { normalizeScale } from "@myakiba/contracts/shared/scale";
import type { EntryCategory } from "@myakiba/contracts/shared/types";
import { v5 as uuidv5 } from "uuid";
import type {
  AssembledEntry,
  AssembledEntryToItem,
  AssembledItem,
  AssembledItemRelease,
  AssembledScrapedData,
  LatestReleaseInfo,
  ScrapedItem,
} from "./types";

const RELEASE_UUID_NAMESPACE = "2c8ed313-3f54-4401-a280-2410ce639ef3";
const NENDOROID_ENTRY_EXTERNAL_ID = 23_355;

export function assembleScrapedData(
  successfulResults: readonly ScrapedItem[],
): AssembledScrapedData {
  const items: AssembledItem[] = successfulResults.map((scrapedItem) => ({
    externalId: scrapedItem.id,
    source: "mfc" as const,
    title: scrapedItem.title,
    mfcTitle: scrapedItem.mfcTitle,
    numbering: scrapedItem.numbering,
    category: scrapedItem.category,
    version: scrapedItem.version,
    scale: normalizeScale(scrapedItem.scale),
    height: scrapedItem.height,
    width: scrapedItem.width,
    depth: scrapedItem.depth,
    mfcMetadataVersion: MFC_ITEM_METADATA_VERSION,
    image: scrapedItem.image,
  }));

  const itemReleases: AssembledItemRelease[] = [];
  const entriesByExternalId = new Map<number, AssembledEntry>();
  const entryToItemsByKey = new Map<string, AssembledEntryToItem>();
  const latestReleaseIdByExternalId = new Map<number, LatestReleaseInfo>();

  const addEntryRelationship = ({
    entryExternalId,
    itemExternalId,
    category,
    sourceLabel,
    entryName = sourceLabel,
    role = "",
    materialPercentage = null,
  }: {
    entryExternalId: number;
    itemExternalId: number;
    category: EntryCategory;
    sourceLabel: string;
    entryName?: string;
    role?: string;
    materialPercentage?: number | null;
  }): void => {
    const existingEntry = entriesByExternalId.get(entryExternalId);
    if (!existingEntry) {
      entriesByExternalId.set(entryExternalId, {
        externalId: entryExternalId,
        source: "mfc",
        category,
        name: entryName,
      });
    }

    const key = `${itemExternalId}:${entryExternalId}`;
    const existingRelationship = entryToItemsByKey.get(key);
    if (!existingRelationship) {
      entryToItemsByKey.set(key, {
        entryExternalId,
        itemExternalId,
        roles: role ? [role] : [],
        sourceLabel,
        materialPercentage,
      });
      return;
    }

    if (role && !existingRelationship.roles.includes(role)) {
      existingRelationship.roles.push(role);
    }
    if (existingRelationship.materialPercentage === null && materialPercentage !== null) {
      existingRelationship.materialPercentage = materialPercentage;
    }
  };

  for (const scraped of successfulResults) {
    for (const classification of scraped.classification) {
      addEntryRelationship({
        entryExternalId: classification.id,
        itemExternalId: scraped.id,
        role: classification.role,
        category: "Classifications",
        sourceLabel: classification.name,
        // MFC links every numbered item to the same Nendoroid entry while
        // decorating the item-page label with that item's number.
        entryName:
          classification.id === NENDOROID_ENTRY_EXTERNAL_ID
            ? classification.name.replace(/\s+\(#[^)]+\)$/u, "")
            : classification.name,
      });
    }

    for (const origin of scraped.origin) {
      addEntryRelationship({
        entryExternalId: origin.id,
        itemExternalId: scraped.id,
        category: "Origins",
        sourceLabel: origin.name,
      });
    }

    for (const character of scraped.character) {
      addEntryRelationship({
        entryExternalId: character.id,
        itemExternalId: scraped.id,
        category: "Characters",
        sourceLabel: character.name,
      });
    }

    for (const company of scraped.company) {
      addEntryRelationship({
        entryExternalId: company.id,
        itemExternalId: scraped.id,
        role: company.role,
        category: "Companies",
        sourceLabel: company.name,
      });
    }

    for (const artist of scraped.artist) {
      addEntryRelationship({
        entryExternalId: artist.id,
        itemExternalId: scraped.id,
        role: artist.role,
        category: "Artists",
        sourceLabel: artist.name,
      });
    }

    for (const event of scraped.event) {
      addEntryRelationship({
        entryExternalId: event.id,
        itemExternalId: scraped.id,
        role: event.role,
        category: "Events",
        sourceLabel: event.name,
      });
    }

    for (const material of scraped.materials) {
      addEntryRelationship({
        entryExternalId: material.id,
        itemExternalId: scraped.id,
        category: "Materials",
        sourceLabel: material.name,
        materialPercentage: material.percentage,
      });
    }

    const releasesForItem = scraped.releaseDate.flatMap((release) => {
      const normalizedDate = normalizeScrapedDate(release.date);
      if (!normalizedDate) {
        log.warn({
          action: "worker.assemble_scraped_data.release_skipped",
          outcome: "skipped",
          reason: "unsupported_release_date_format",
          itemExternalId: scraped.id,
          releaseDateRaw: release.date,
        });
        return [];
      }

      return [
        {
          id: uuidv5(
            `${scraped.id}-${normalizedDate}-${release.type}-${release.price}-${release.priceCurrency}-${release.barcode}`,
            RELEASE_UUID_NAMESPACE,
          ),
          itemExternalId: scraped.id,
          date: normalizedDate,
          type: release.type,
          price: release.price,
          priceCurrency: release.priceCurrency,
          barcode: release.barcode,
        },
      ];
    });

    if (releasesForItem.length > 0) {
      const latest = [...releasesForItem].toSorted((a, b) => a.date.localeCompare(b.date))[
        releasesForItem.length - 1
      ];
      latestReleaseIdByExternalId.set(scraped.id, {
        releaseId: latest.id,
        date: latest.date,
      });
    } else {
      latestReleaseIdByExternalId.set(scraped.id, {
        releaseId: null,
        date: null,
      });
    }

    itemReleases.push(...releasesForItem);
  }

  return {
    items,
    entries: [...entriesByExternalId.values()],
    entryToItems: [...entryToItemsByKey.values()],
    itemReleases,
    latestReleaseIdByExternalId,
  };
}
