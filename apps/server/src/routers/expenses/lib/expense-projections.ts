import { SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { ShippingMethod } from "@myakiba/contracts/shared/types";
import type {
  ExpenseBucket,
  ExpensesOverviewResponse,
  ExpensesShippingResponse,
  ExpensesTrendsResponse,
} from "../model";
import type { ExpenseFacts } from "./expense-facts";
import { EMPTY_ORDER_TOTAL, feeSpend, toAverage } from "./expense-queries";
import type {
  BundleEfficiencyRow,
  ItemSeriesRow,
  ItemTotalRow,
  OrderSeriesRow,
  OrderTotalRow,
  ShippingSeriesRow,
} from "./expense-queries";

type ShippingValues = Record<ShippingMethod, number>;
type ShippingTotals = Record<ShippingMethod, { readonly total: number; readonly count: number }>;

const EMPTY_SHIPPING_VALUES = Object.fromEntries(
  SHIPPING_METHODS.map((method) => [method, 0]),
) as ShippingValues;

const EMPTY_SHIPPING_TOTALS = Object.fromEntries(
  SHIPPING_METHODS.map((method) => [method, { total: 0, count: 0 }]),
) as ShippingTotals;

function emptySpendSeriesBucket() {
  return {
    paidItemSpend: 0,
    ownedItemSpend: 0,
    paidItemCount: 0,
    feeSpend: 0,
    orderItemSpend: 0,
    orderSpend: 0,
    orderCount: 0,
  };
}

function emptyAverageSeriesBucket() {
  return {
    collectionItemSpend: 0,
    collectionItemCount: 0,
    orderItemSpend: 0,
    orderItemCount: 0,
    feeSpend: 0,
    orderSpend: 0,
    orderCount: 0,
  };
}

function sumItemSeries(series: readonly ItemSeriesRow[]): ItemTotalRow {
  return series.reduce(
    (acc, row) => ({
      itemSpend: acc.itemSpend + row.itemSpend,
      itemCount: acc.itemCount + row.itemCount,
    }),
    { itemSpend: 0, itemCount: 0 },
  );
}

export function deriveTotalsFromSeries(
  paidItemSeries: readonly ItemSeriesRow[],
  ownedItemSeries: readonly ItemSeriesRow[],
  orderSeries: readonly OrderSeriesRow[],
): ExpenseFacts {
  const paidSum = sumItemSeries(paidItemSeries);
  const ownedSum = sumItemSeries(ownedItemSeries);
  const orderTotal = orderSeries.reduce<OrderTotalRow>(
    (acc, row) => ({
      shippingSpend: acc.shippingSpend + row.shippingSpend,
      taxesSpend: acc.taxesSpend + row.taxesSpend,
      dutiesSpend: acc.dutiesSpend + row.dutiesSpend,
      tariffsSpend: acc.tariffsSpend + row.tariffsSpend,
      miscSpend: acc.miscSpend + row.miscSpend,
      orderItemSpend: acc.orderItemSpend + row.orderItemSpend,
      orderSpend: acc.orderSpend + row.orderSpend,
      paidOrderCount: acc.paidOrderCount + row.orderCount,
      orderItemCount: acc.orderItemCount + row.orderItemCount,
    }),
    { ...EMPTY_ORDER_TOTAL },
  );

  return {
    paidItemTotal: { itemSpend: paidSum.itemSpend, paidItemCount: paidSum.itemCount },
    ownedItemTotal: { itemSpend: ownedSum.itemSpend, itemCount: ownedSum.itemCount },
    orderTotal,
  };
}

export function buildExpenseTotals({
  paidItemTotal,
  ownedItemTotal,
  orderTotal,
}: ExpenseFacts): ExpensesOverviewResponse["totals"] {
  const totalFees = feeSpend(orderTotal);
  const { paidOrderCount } = orderTotal;

  return {
    totalSpend: paidItemTotal.itemSpend + totalFees,
    feeSpend: totalFees,
    collectionItemSpend: ownedItemTotal.itemSpend,
    orderItemSpend: orderTotal.orderItemSpend,
    orderSpend: orderTotal.orderSpend,
    shippingSpend: orderTotal.shippingSpend,
    taxesSpend: orderTotal.taxesSpend,
    dutiesSpend: orderTotal.dutiesSpend,
    tariffsSpend: orderTotal.tariffsSpend,
    miscSpend: orderTotal.miscSpend,
    averageOrderSpend: toAverage(orderTotal.orderSpend, paidOrderCount),
    averageCollectionItemSpend: toAverage(ownedItemTotal.itemSpend, ownedItemTotal.itemCount),
    averageOrderItemSpend: toAverage(orderTotal.orderItemSpend, orderTotal.orderItemCount),
    averageFeeSpend: toAverage(totalFees, paidOrderCount),
    averageShippingSpend: toAverage(orderTotal.shippingSpend, paidOrderCount),
    averageTaxesSpend: toAverage(orderTotal.taxesSpend, paidOrderCount),
    averageDutiesSpend: toAverage(orderTotal.dutiesSpend, paidOrderCount),
    averageTariffsSpend: toAverage(orderTotal.tariffsSpend, paidOrderCount),
    averageMiscSpend: toAverage(orderTotal.miscSpend, paidOrderCount),
    paidOrderCount,
    paidItemCount: paidItemTotal.paidItemCount,
    ownedItemCount: ownedItemTotal.itemCount,
  };
}

export function projectSpendResponse({
  bucket,
  paidItemTotal,
  ownedItemTotal,
  orderTotal,
  paidItemSeries,
  ownedItemSeries,
  orderSeries,
}: ExpenseFacts & {
  readonly bucket: ExpenseBucket;
  readonly paidItemSeries: readonly ItemSeriesRow[];
  readonly ownedItemSeries: readonly ItemSeriesRow[];
  readonly orderSeries: readonly OrderSeriesRow[];
}): Pick<
  ExpensesTrendsResponse,
  "bucket" | "totals" | "spendOverTime" | "cumulativeSpendOverTime"
> {
  const bucketValues = new Map<string, ReturnType<typeof emptySpendSeriesBucket>>();

  for (const row of paidItemSeries) {
    bucketValues.set(row.bucket, {
      ...emptySpendSeriesBucket(),
      paidItemSpend: row.itemSpend,
      paidItemCount: row.itemCount,
    });
  }

  for (const row of ownedItemSeries) {
    const current = bucketValues.get(row.bucket) ?? emptySpendSeriesBucket();
    bucketValues.set(row.bucket, { ...current, ownedItemSpend: row.itemSpend });
  }

  for (const row of orderSeries) {
    const current = bucketValues.get(row.bucket) ?? emptySpendSeriesBucket();
    bucketValues.set(row.bucket, {
      ...current,
      feeSpend: feeSpend(row),
      orderItemSpend: row.orderItemSpend,
      orderSpend: row.orderSpend,
      orderCount: row.orderCount,
    });
  }

  const spendOverTime = [...bucketValues.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([bucketName, value]) => ({
      bucket: bucketName,
      collectionItemSpend: value.ownedItemSpend,
      orderItemSpend: value.orderItemSpend,
      feeSpend: value.feeSpend,
      orderSpend: value.orderSpend,
      totalSpend: value.paidItemSpend + value.feeSpend,
    }));

  let cumulativeTotalSpend = 0;
  let cumulativeOrderSpend = 0;
  let cumulativeCollectionItemSpend = 0;
  let cumulativeOrderItemSpend = 0;
  let cumulativeFeeSpend = 0;
  const cumulativeSpendOverTime = spendOverTime.map((point) => {
    cumulativeTotalSpend += point.totalSpend;
    cumulativeOrderSpend += point.orderSpend;
    cumulativeCollectionItemSpend += point.collectionItemSpend;
    cumulativeOrderItemSpend += point.orderItemSpend;
    cumulativeFeeSpend += point.feeSpend;

    return {
      bucket: point.bucket,
      totalSpend: cumulativeTotalSpend,
      orderSpend: cumulativeOrderSpend,
      collectionItemSpend: cumulativeCollectionItemSpend,
      orderItemSpend: cumulativeOrderItemSpend,
      feeSpend: cumulativeFeeSpend,
    };
  });

  return {
    bucket,
    totals: buildExpenseTotals({ paidItemTotal, ownedItemTotal, orderTotal }),
    spendOverTime,
    cumulativeSpendOverTime,
  };
}

export function projectAveragesResponse({
  ownedItemSeries,
  orderSeries,
}: {
  readonly ownedItemSeries: readonly ItemSeriesRow[];
  readonly orderSeries: readonly OrderSeriesRow[];
}): Pick<ExpensesTrendsResponse, "averagesOverTime" | "cumulativeAveragesOverTime"> {
  const bucketValues = new Map<string, ReturnType<typeof emptyAverageSeriesBucket>>();

  for (const row of ownedItemSeries) {
    bucketValues.set(row.bucket, {
      ...emptyAverageSeriesBucket(),
      collectionItemSpend: row.itemSpend,
      collectionItemCount: row.itemCount,
    });
  }

  for (const row of orderSeries) {
    const current = bucketValues.get(row.bucket) ?? emptyAverageSeriesBucket();
    bucketValues.set(row.bucket, {
      ...current,
      feeSpend: feeSpend(row),
      orderItemSpend: row.orderItemSpend,
      orderItemCount: row.orderItemCount,
      orderSpend: row.orderSpend,
      orderCount: row.orderCount,
    });
  }

  const sortedBuckets = [...bucketValues.entries()].toSorted(([a], [b]) => a.localeCompare(b));
  const averagesOverTime = sortedBuckets.map(([bucketName, value]) => ({
    bucket: bucketName,
    averageOrderSpend: toAverage(value.orderSpend, value.orderCount),
    averageCollectionItemSpend: toAverage(value.collectionItemSpend, value.collectionItemCount),
    averageOrderItemSpend: toAverage(value.orderItemSpend, value.orderItemCount),
    averageFeeSpend: toAverage(value.feeSpend, value.orderCount),
  }));
  let cumulativeOrderSpend = 0;
  let cumulativeOrderCount = 0;
  let cumulativeCollectionItemSpend = 0;
  let cumulativeCollectionItemCount = 0;
  let cumulativeOrderItemSpend = 0;
  let cumulativeOrderItemCount = 0;
  let cumulativeFeeSpend = 0;
  const cumulativeAveragesOverTime = sortedBuckets.map(([bucketName, value]) => {
    cumulativeOrderSpend += value.orderSpend;
    cumulativeOrderCount += value.orderCount;
    cumulativeCollectionItemSpend += value.collectionItemSpend;
    cumulativeCollectionItemCount += value.collectionItemCount;
    cumulativeOrderItemSpend += value.orderItemSpend;
    cumulativeOrderItemCount += value.orderItemCount;
    cumulativeFeeSpend += value.feeSpend;

    return {
      bucket: bucketName,
      averageOrderSpend: toAverage(cumulativeOrderSpend, cumulativeOrderCount),
      averageCollectionItemSpend: toAverage(
        cumulativeCollectionItemSpend,
        cumulativeCollectionItemCount,
      ),
      averageOrderItemSpend: toAverage(cumulativeOrderItemSpend, cumulativeOrderItemCount),
      averageFeeSpend: toAverage(cumulativeFeeSpend, cumulativeOrderCount),
    };
  });

  return {
    averagesOverTime,
    cumulativeAveragesOverTime,
  };
}

export function projectShippingResponse({
  bucket,
  shippingSeries,
  bundleRows,
}: {
  readonly bucket: ExpenseBucket;
  readonly shippingSeries: readonly ShippingSeriesRow[];
  readonly bundleRows: readonly BundleEfficiencyRow[];
}): Pick<
  ExpensesShippingResponse,
  | "bucket"
  | "usedShippingMethods"
  | "shippingFeeByMethod"
  | "averageShippingFeeByMethod"
  | "cumulativeShippingFeeByMethod"
  | "cumulativeAverageShippingFeeByMethod"
  | "bundleEfficiency"
> {
  const shippingFeeByMethod = new Map<string, ShippingValues>();
  const averageShippingFeeByMethod = new Map<string, ShippingValues>();
  const shippingTotalsByBucket = new Map<string, ShippingTotals>();
  const usedShippingMethodSet = new Set<ShippingMethod>();

  for (const row of shippingSeries) {
    usedShippingMethodSet.add(row.shippingMethod);
    const values = shippingFeeByMethod.get(row.bucket) ?? EMPTY_SHIPPING_VALUES;
    shippingFeeByMethod.set(row.bucket, {
      ...values,
      [row.shippingMethod]: row.shippingSpend,
    });

    const averageValues = averageShippingFeeByMethod.get(row.bucket) ?? EMPTY_SHIPPING_VALUES;
    averageShippingFeeByMethod.set(row.bucket, {
      ...averageValues,
      [row.shippingMethod]: toAverage(row.shippingSpend, row.orderCount),
    });

    const totals = shippingTotalsByBucket.get(row.bucket) ?? EMPTY_SHIPPING_TOTALS;
    const methodTotals = totals[row.shippingMethod];
    shippingTotalsByBucket.set(row.bucket, {
      ...totals,
      [row.shippingMethod]: {
        total: methodTotals.total + row.shippingSpend,
        count: methodTotals.count + row.orderCount,
      },
    });
  }

  let cumulativeShippingTotals = EMPTY_SHIPPING_TOTALS;
  const cumulativeAverageShippingFeeByMethod = [...shippingTotalsByBucket.entries()].map(
    ([bucketName, totals]) => {
      const nextTotals: ShippingTotals = { ...cumulativeShippingTotals };
      for (const method of SHIPPING_METHODS) {
        const methodTotals = nextTotals[method];
        const bucketTotals = totals[method];
        nextTotals[method] = {
          total: methodTotals.total + bucketTotals.total,
          count: methodTotals.count + bucketTotals.count,
        };
      }
      cumulativeShippingTotals = nextTotals;

      const values: ShippingValues = { ...EMPTY_SHIPPING_VALUES };
      for (const method of SHIPPING_METHODS) {
        values[method] = toAverage(
          cumulativeShippingTotals[method].total,
          cumulativeShippingTotals[method].count,
        );
      }

      return {
        bucket: bucketName,
        values,
      };
    },
  );

  let cumulativeFeeValues = EMPTY_SHIPPING_VALUES;
  const cumulativeShippingFeeByMethod = [...shippingFeeByMethod.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([bucketName, values]) => {
      const nextFeeValues: ShippingValues = { ...cumulativeFeeValues };
      for (const method of SHIPPING_METHODS) {
        nextFeeValues[method] += values[method];
      }
      cumulativeFeeValues = nextFeeValues;

      return {
        bucket: bucketName,
        values: { ...cumulativeFeeValues },
      };
    });

  const bundleFees = new Map<number, ShippingTotals>();
  for (const row of bundleRows) {
    usedShippingMethodSet.add(row.shippingMethod);
    const current = bundleFees.get(row.itemCount) ?? EMPTY_SHIPPING_TOTALS;
    bundleFees.set(row.itemCount, {
      ...current,
      [row.shippingMethod]: {
        total: row.shippingFeeTotal,
        count: row.orderCount,
      },
    });
  }

  return {
    bucket,
    usedShippingMethods: SHIPPING_METHODS.filter((method) => usedShippingMethodSet.has(method)),
    shippingFeeByMethod: [...shippingFeeByMethod.entries()].map(([bucketName, values]) => ({
      bucket: bucketName,
      values,
    })),
    averageShippingFeeByMethod: [...averageShippingFeeByMethod.entries()].map(
      ([bucketName, values]) => ({
        bucket: bucketName,
        values,
      }),
    ),
    cumulativeAverageShippingFeeByMethod,
    cumulativeShippingFeeByMethod,
    bundleEfficiency: [...bundleFees.entries()].map(([itemCount, values]) => {
      const averages: ShippingValues = { ...EMPTY_SHIPPING_VALUES };
      for (const method of SHIPPING_METHODS) {
        averages[method] = toAverage(values[method].total, values[method].count);
      }

      return { itemCount, values: averages };
    }),
  };
}
