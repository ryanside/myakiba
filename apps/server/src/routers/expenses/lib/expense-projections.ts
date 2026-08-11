import { eachMonthOfInterval, eachYearOfInterval, format, isAfter, parseISO } from "date-fns";
import { SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { ShippingMethod } from "@myakiba/contracts/shared/types";
import type {
  ExpenseBucket,
  ExpenseFilters,
  ExpensesCollectionResponse,
  ExpensesOrdersResponse,
  ExpensesShippingResponse,
} from "../model";
import { feeSpend, toAverage } from "./expense-queries";
import type {
  BundleEfficiencyRow,
  CollectionCategoryRow,
  CollectionSummaryRow,
  ItemSeriesRow,
  OrderSeriesRow,
  OrderTotalRow,
  ShippingMethodTotalRow,
  ShippingSeriesRow,
  UnpaidOrderTotalRow,
} from "./expense-queries";

type ShippingValues = Record<ShippingMethod, number>;
type ShippingTotals = Record<ShippingMethod, { total: number; count: number }>;

function emptyShippingValues(): ShippingValues {
  return {
    "n/a": 0,
    EMS: 0,
    SAL: 0,
    AIRMAIL: 0,
    SURFACE: 0,
    FEDEX: 0,
    DHL: 0,
    Colissimo: 0,
    UPS: 0,
    Domestic: 0,
  };
}

function emptyShippingTotals(): ShippingTotals {
  return {
    "n/a": { total: 0, count: 0 },
    EMS: { total: 0, count: 0 },
    SAL: { total: 0, count: 0 },
    AIRMAIL: { total: 0, count: 0 },
    SURFACE: { total: 0, count: 0 },
    FEDEX: { total: 0, count: 0 },
    DHL: { total: 0, count: 0 },
    Colissimo: { total: 0, count: 0 },
    UPS: { total: 0, count: 0 },
    Domestic: { total: 0, count: 0 },
  };
}

function percentage(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function bucketDate(bucket: string, bucketType: ExpenseBucket): Date {
  return parseISO(bucketType === "month" ? `${bucket}-01` : `${bucket}-01-01`);
}

function getPeriodBuckets({
  filters,
  bucket,
  existingBuckets,
}: {
  filters: ExpenseFilters;
  bucket: ExpenseBucket;
  existingBuckets: readonly string[];
}): string[] {
  const sortedExisting = [...new Set(existingBuckets)].toSorted();
  let start: Date | null = null;
  let end: Date | null = null;
  if (filters.dateStart && filters.dateEnd) {
    start = parseISO(filters.dateStart);
    end = parseISO(filters.dateEnd);
  } else {
    const firstBucket = sortedExisting[0];
    const lastBucket = sortedExisting.at(-1);
    if (firstBucket) start = bucketDate(firstBucket, bucket);
    if (lastBucket) end = bucketDate(lastBucket, bucket);
  }

  if (!start || !end || isAfter(start, end)) {
    return sortedExisting;
  }

  const dates =
    bucket === "month" ? eachMonthOfInterval({ start, end }) : eachYearOfInterval({ start, end });

  return dates.map((date) => format(date, bucket === "month" ? "yyyy-MM" : "yyyy"));
}

export function projectCollectionDashboard({
  filters,
  bucket,
  summary,
  categories,
  series,
}: {
  filters: ExpenseFilters;
  bucket: ExpenseBucket;
  summary: CollectionSummaryRow;
  categories: readonly CollectionCategoryRow[];
  series: readonly ItemSeriesRow[];
}): ExpensesCollectionResponse {
  const byBucket = new Map(series.map((row) => [row.bucket, row]));
  const buckets = getPeriodBuckets({
    filters,
    bucket,
    existingBuckets: series.map((row) => row.bucket),
  });
  const spendingByPeriod = buckets.map((bucketName) => ({
    bucket: bucketName,
    collectionItems: byBucket.get(bucketName)?.itemSpend ?? 0,
  }));
  const averageCostByPeriod = buckets.map((bucketName) => {
    const row = byBucket.get(bucketName);
    return {
      bucket: bucketName,
      collectionItems: toAverage(row?.itemSpend ?? 0, row?.itemCount ?? 0),
    };
  });
  let cumulativeSpend = 0;
  let cumulativeCount = 0;
  const cumulativeSpending: ExpensesCollectionResponse["cumulativeSpending"] = [];
  const averageCostToDate: ExpensesCollectionResponse["averageCostToDate"] = [];
  const categorizedItemCount = categories.reduce((total, category) => total + category.count, 0);
  for (const point of spendingByPeriod) {
    cumulativeSpend += point.collectionItems;
    cumulativeCount += byBucket.get(point.bucket)?.itemCount ?? 0;
    cumulativeSpending.push({ ...point, collectionItems: cumulativeSpend });
    averageCostToDate.push({
      bucket: point.bucket,
      collectionItems: toAverage(cumulativeSpend, cumulativeCount),
    });
  }

  return {
    summary: {
      spend: summary.spend,
      orderLinked: {
        spend: summary.orderLinkedSpend,
        percentage: percentage(summary.orderLinkedSpend, summary.spend),
        count: summary.orderLinkedCount,
      },
      standalone: {
        spend: summary.standaloneSpend,
        percentage: percentage(summary.standaloneSpend, summary.spend),
        count: summary.standaloneCount,
      },
    },
    kpis: {
      itemCount: summary.itemCount,
      averageItemCost: toAverage(summary.spend, summary.itemCount),
      shopCount: summary.shopCount,
    },
    breakdown: categories.map((category) => ({
      ...category,
      percentage: percentage(category.count, categorizedItemCount),
    })),
    spendingByPeriod,
    cumulativeSpending,
    averageCostByPeriod,
    averageCostToDate,
  };
}

export function projectOrdersDashboard({
  filters,
  bucket,
  total,
  series,
  unpaid,
}: {
  filters: ExpenseFilters;
  bucket: ExpenseBucket;
  total: OrderTotalRow;
  series: readonly OrderSeriesRow[];
  unpaid: UnpaidOrderTotalRow;
}): ExpensesOrdersResponse {
  const totalFees = feeSpend(total);
  const byBucket = new Map(series.map((row) => [row.bucket, row]));
  const buckets = getPeriodBuckets({
    filters,
    bucket,
    existingBuckets: series.map((row) => row.bucket),
  });
  const spendingByPeriod = buckets.map((bucketName) => {
    const row = byBucket.get(bucketName);
    return {
      bucket: bucketName,
      total: row?.orderSpend ?? 0,
      orderItems: row?.orderItemSpend ?? 0,
      fees: row ? feeSpend(row) : 0,
    };
  });
  const averageCostsByPeriod = buckets.map((bucketName) => {
    const row = byBucket.get(bucketName);
    return {
      bucket: bucketName,
      orderTotal: toAverage(row?.orderSpend ?? 0, row?.orderCount ?? 0),
      orderItem: toAverage(row?.orderItemSpend ?? 0, row?.orderItemCount ?? 0),
      feesPerOrder: toAverage(row ? feeSpend(row) : 0, row?.orderCount ?? 0),
    };
  });
  let cumulativeTotal = 0;
  let cumulativeItems = 0;
  let cumulativeFees = 0;
  let cumulativeOrderCount = 0;
  let cumulativeItemCount = 0;
  const cumulativeSpending: ExpensesOrdersResponse["cumulativeSpending"] = [];
  const averageCostsToDate: ExpensesOrdersResponse["averageCostsToDate"] = [];
  for (const point of spendingByPeriod) {
    const row = byBucket.get(point.bucket);
    cumulativeTotal += point.total;
    cumulativeItems += point.orderItems;
    cumulativeFees += point.fees;
    cumulativeOrderCount += row?.orderCount ?? 0;
    cumulativeItemCount += row?.orderItemCount ?? 0;
    cumulativeSpending.push({
      bucket: point.bucket,
      total: cumulativeTotal,
      orderItems: cumulativeItems,
      fees: cumulativeFees,
    });
    averageCostsToDate.push({
      bucket: point.bucket,
      orderTotal: toAverage(cumulativeTotal, cumulativeOrderCount),
      orderItem: toAverage(cumulativeItems, cumulativeItemCount),
      feesPerOrder: toAverage(cumulativeFees, cumulativeOrderCount),
    });
  }
  const unpaidCommitments =
    unpaid.items +
    unpaid.shipping +
    unpaid.taxes +
    unpaid.duties +
    unpaid.tariffs +
    unpaid.miscFees;
  const breakdownValues = [
    { key: "orderItems", label: "Order Items", value: total.orderItemSpend },
    { key: "shipping", label: "Shipping", value: total.shippingSpend },
    { key: "taxes", label: "Taxes", value: total.taxesSpend },
    { key: "duties", label: "Duties", value: total.dutiesSpend },
    { key: "tariffs", label: "Tariffs", value: total.tariffsSpend },
    { key: "misc", label: "Misc", value: total.miscSpend },
  ] as const;

  return {
    summary: {
      spend: total.orderSpend,
      orderItems: {
        spend: total.orderItemSpend,
        percentage: percentage(total.orderItemSpend, total.orderSpend),
      },
      fees: {
        spend: totalFees,
        percentage: percentage(totalFees, total.orderSpend),
      },
    },
    kpis: {
      paidOrderCount: total.paidOrderCount,
      orderItemCount: total.orderItemCount,
      unpaidOrderCount: unpaid.orderCount,
      unpaidCommitments,
    },
    breakdown: breakdownValues
      .filter((entry) => entry.value > 0)
      .map((entry) => ({
        ...entry,
        percentage: percentage(entry.value, total.orderSpend),
      })),
    spendingByPeriod,
    cumulativeSpending,
    averageCostsByPeriod,
    averageCostsToDate,
  };
}

export function projectShippingDashboard({
  filters,
  bucket,
  methodTotals,
  series,
  bundleRows,
}: {
  filters: ExpenseFilters;
  bucket: ExpenseBucket;
  methodTotals: readonly ShippingMethodTotalRow[];
  series: readonly ShippingSeriesRow[];
  bundleRows: readonly BundleEfficiencyRow[];
}): ExpensesShippingResponse {
  const shippingSpend = methodTotals.reduce((sum, row) => sum + row.shippingSpend, 0);
  const paidOrderCount = methodTotals.reduce((sum, row) => sum + row.orderCount, 0);
  const chargedOrderCount = methodTotals.reduce((sum, row) => sum + row.chargedOrderCount, 0);
  const freeOrderCount = methodTotals.reduce((sum, row) => sum + row.freeOrderCount, 0);
  const nonzeroMethods = methodTotals
    .filter((row) => row.shippingSpend > 0)
    .toSorted((left, right) => right.shippingSpend - left.shippingSpend);
  const buckets = getPeriodBuckets({
    filters,
    bucket,
    existingBuckets: series.map((row) => row.bucket),
  });
  const seriesTotals = new Map<string, ShippingTotals>();
  for (const row of series) {
    const values = seriesTotals.get(row.bucket) ?? emptyShippingTotals();
    values[row.shippingMethod] = { total: row.shippingSpend, count: row.orderCount };
    seriesTotals.set(row.bucket, values);
  }
  const spendByMethodAndPeriod = buckets.map((bucketName) => {
    const values = emptyShippingValues();
    const totals = seriesTotals.get(bucketName);
    for (const method of SHIPPING_METHODS) {
      values[method] = totals?.[method].total ?? 0;
    }
    return { bucket: bucketName, values };
  });
  const averageCostByMethodAndPeriod = buckets.map((bucketName) => {
    const values = emptyShippingValues();
    const totals = seriesTotals.get(bucketName);
    for (const method of SHIPPING_METHODS) {
      values[method] = toAverage(totals?.[method].total ?? 0, totals?.[method].count ?? 0);
    }
    return { bucket: bucketName, values };
  });
  const cumulativeTotals = emptyShippingTotals();
  const cumulativeSpendByMethod: ExpensesShippingResponse["cumulativeSpendByMethod"] = [];
  const averageCostByMethodToDate: ExpensesShippingResponse["averageCostByMethodToDate"] = [];
  for (const bucketName of buckets) {
    const bucketTotals = seriesTotals.get(bucketName);
    const spendValues = emptyShippingValues();
    const averageValues = emptyShippingValues();
    for (const method of SHIPPING_METHODS) {
      cumulativeTotals[method].total += bucketTotals?.[method].total ?? 0;
      cumulativeTotals[method].count += bucketTotals?.[method].count ?? 0;
      spendValues[method] = cumulativeTotals[method].total;
      averageValues[method] = toAverage(
        cumulativeTotals[method].total,
        cumulativeTotals[method].count,
      );
    }
    cumulativeSpendByMethod.push({ bucket: bucketName, values: spendValues });
    averageCostByMethodToDate.push({ bucket: bucketName, values: averageValues });
  }
  const bundleTotals = new Map<number, ShippingTotals>();
  for (const row of bundleRows) {
    const values = bundleTotals.get(row.itemCount) ?? emptyShippingTotals();
    values[row.shippingMethod] = { total: row.shippingFeeTotal, count: row.orderCount };
    bundleTotals.set(row.itemCount, values);
  }
  const averageCostByItemCount = [...bundleTotals.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([itemCount, totals]) => {
      const values = emptyShippingValues();
      for (const method of SHIPPING_METHODS) {
        values[method] = toAverage(totals[method].total, totals[method].count);
      }
      return { itemCount, values };
    });

  return {
    summary: { spend: shippingSpend },
    kpis: {
      methodCount: methodTotals.filter((row) => row.shippingMethod !== "n/a").length,
      chargedOrderCount,
      freeOrderCount,
      averageShipping: toAverage(shippingSpend, paidOrderCount),
    },
    breakdown: nonzeroMethods.map((row) => ({
      method: row.shippingMethod,
      spend: row.shippingSpend,
      percentage: percentage(row.shippingSpend, shippingSpend),
      orderCount: row.orderCount,
    })),
    spendByMethodAndPeriod,
    cumulativeSpendByMethod,
    averageCostByMethodAndPeriod,
    averageCostByMethodToDate,
    averageCostByItemCount,
  };
}
