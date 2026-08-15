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
    if (firstBucket) {
      start = parseISO(bucket === "month" ? `${firstBucket}-01` : `${firstBucket}-01-01`);
    }
    if (lastBucket) {
      end = parseISO(bucket === "month" ? `${lastBucket}-01` : `${lastBucket}-01-01`);
    }
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
    const itemSpend = row?.itemSpend ?? 0;
    const itemCount = row?.itemCount ?? 0;
    return {
      bucket: bucketName,
      collectionItems: itemCount > 0 ? Math.round(itemSpend / itemCount) : 0,
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
      collectionItems: cumulativeCount > 0 ? Math.round(cumulativeSpend / cumulativeCount) : 0,
    });
  }

  return {
    summary: {
      spend: summary.spend,
      orderLinked: {
        spend: summary.orderLinkedSpend,
        percentage: summary.spend > 0 ? (summary.orderLinkedSpend / summary.spend) * 100 : 0,
        count: summary.orderLinkedCount,
      },
      standalone: {
        spend: summary.standaloneSpend,
        percentage: summary.spend > 0 ? (summary.standaloneSpend / summary.spend) * 100 : 0,
        count: summary.standaloneCount,
      },
    },
    kpis: {
      itemCount: summary.itemCount,
      averageItemCost: summary.itemCount > 0 ? Math.round(summary.spend / summary.itemCount) : 0,
      shopCount: summary.shopCount,
    },
    breakdown: categories.map((category) => ({
      ...category,
      percentage: categorizedItemCount > 0 ? (category.count / categorizedItemCount) * 100 : 0,
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
  const totalFees =
    total.shippingSpend +
    total.taxesSpend +
    total.dutiesSpend +
    total.tariffsSpend +
    total.miscSpend;
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
      fees: row
        ? row.shippingSpend + row.taxesSpend + row.dutiesSpend + row.tariffsSpend + row.miscSpend
        : 0,
    };
  });
  const averageCostsByPeriod = buckets.map((bucketName) => {
    const row = byBucket.get(bucketName);
    const orderSpend = row?.orderSpend ?? 0;
    const orderItemSpend = row?.orderItemSpend ?? 0;
    const orderCount = row?.orderCount ?? 0;
    const orderItemCount = row?.orderItemCount ?? 0;
    const fees = row
      ? row.shippingSpend + row.taxesSpend + row.dutiesSpend + row.tariffsSpend + row.miscSpend
      : 0;
    return {
      bucket: bucketName,
      orderTotal: orderCount > 0 ? Math.round(orderSpend / orderCount) : 0,
      orderItem: orderItemCount > 0 ? Math.round(orderItemSpend / orderItemCount) : 0,
      feesPerOrder: orderCount > 0 ? Math.round(fees / orderCount) : 0,
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
      orderTotal: cumulativeOrderCount > 0 ? Math.round(cumulativeTotal / cumulativeOrderCount) : 0,
      orderItem: cumulativeItemCount > 0 ? Math.round(cumulativeItems / cumulativeItemCount) : 0,
      feesPerOrder:
        cumulativeOrderCount > 0 ? Math.round(cumulativeFees / cumulativeOrderCount) : 0,
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
        percentage: total.orderSpend > 0 ? (total.orderItemSpend / total.orderSpend) * 100 : 0,
      },
      fees: {
        spend: totalFees,
        percentage: total.orderSpend > 0 ? (totalFees / total.orderSpend) * 100 : 0,
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
        percentage: total.orderSpend > 0 ? (entry.value / total.orderSpend) * 100 : 0,
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
    const values: ShippingTotals = seriesTotals.get(row.bucket) ?? {
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
    values[row.shippingMethod] = { total: row.shippingSpend, count: row.orderCount };
    seriesTotals.set(row.bucket, values);
  }
  const spendByMethodAndPeriod = buckets.map((bucketName) => {
    const values: ShippingValues = {
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
    const totals = seriesTotals.get(bucketName);
    for (const method of SHIPPING_METHODS) {
      values[method] = totals?.[method].total ?? 0;
    }
    return { bucket: bucketName, values };
  });
  const averageCostByMethodAndPeriod = buckets.map((bucketName) => {
    const values: ShippingValues = {
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
    const totals = seriesTotals.get(bucketName);
    for (const method of SHIPPING_METHODS) {
      const total = totals?.[method].total ?? 0;
      const count = totals?.[method].count ?? 0;
      values[method] = count > 0 ? Math.round(total / count) : 0;
    }
    return { bucket: bucketName, values };
  });
  const cumulativeTotals: ShippingTotals = {
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
  const cumulativeSpendByMethod: ExpensesShippingResponse["cumulativeSpendByMethod"] = [];
  const averageCostByMethodToDate: ExpensesShippingResponse["averageCostByMethodToDate"] = [];
  for (const bucketName of buckets) {
    const bucketTotals = seriesTotals.get(bucketName);
    const spendValues: ShippingValues = {
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
    const averageValues: ShippingValues = {
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
    for (const method of SHIPPING_METHODS) {
      cumulativeTotals[method].total += bucketTotals?.[method].total ?? 0;
      cumulativeTotals[method].count += bucketTotals?.[method].count ?? 0;
      spendValues[method] = cumulativeTotals[method].total;
      averageValues[method] =
        cumulativeTotals[method].count > 0
          ? Math.round(cumulativeTotals[method].total / cumulativeTotals[method].count)
          : 0;
    }
    cumulativeSpendByMethod.push({ bucket: bucketName, values: spendValues });
    averageCostByMethodToDate.push({ bucket: bucketName, values: averageValues });
  }
  const bundleTotals = new Map<number, ShippingTotals>();
  for (const row of bundleRows) {
    const values: ShippingTotals = bundleTotals.get(row.itemCount) ?? {
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
    values[row.shippingMethod] = { total: row.shippingFeeTotal, count: row.orderCount };
    bundleTotals.set(row.itemCount, values);
  }
  const averageCostByItemCount = [...bundleTotals.entries()]
    .toSorted(([left], [right]) => left - right)
    .map(([itemCount, totals]) => {
      const values: ShippingValues = {
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
      for (const method of SHIPPING_METHODS) {
        values[method] =
          totals[method].count > 0 ? Math.round(totals[method].total / totals[method].count) : 0;
      }
      return { itemCount, values };
    });

  return {
    summary: { spend: shippingSpend },
    kpis: {
      methodCount: methodTotals.filter((row) => row.shippingMethod !== "n/a").length,
      chargedOrderCount,
      freeOrderCount,
      averageShipping: paidOrderCount > 0 ? Math.round(shippingSpend / paidOrderCount) : 0,
    },
    breakdown: nonzeroMethods.map((row) => ({
      method: row.shippingMethod,
      spend: row.shippingSpend,
      percentage: shippingSpend > 0 ? (row.shippingSpend / shippingSpend) * 100 : 0,
      orderCount: row.orderCount,
    })),
    spendByMethodAndPeriod,
    cumulativeSpendByMethod,
    averageCostByMethodAndPeriod,
    averageCostByMethodToDate,
    averageCostByItemCount,
  };
}
