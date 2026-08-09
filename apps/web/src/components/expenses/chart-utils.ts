import { useCallback, useMemo, useState } from "react";
import { SHIPPING_METHODS } from "@myakiba/contracts/shared/constants";
import type { ShippingMethod } from "@myakiba/contracts/shared/types";
import type {
  ShippingItemCountPoint,
  ShippingMethodPoint,
} from "@myakiba/contracts/expenses/schema";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";

export const EXPENSE_CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
  "var(--chart-10)",
] as const;

const shippingMethodKeys = {
  "n/a": "na",
  EMS: "EMS",
  SAL: "SAL",
  AIRMAIL: "AIRMAIL",
  SURFACE: "SURFACE",
  FEDEX: "FEDEX",
  DHL: "DHL",
  Colissimo: "Colissimo",
  UPS: "UPS",
  Domestic: "Domestic",
} as const satisfies Readonly<Record<ShippingMethod, string>>;

type ShippingChartKey = (typeof shippingMethodKeys)[ShippingMethod];

type ShippingChartRow = { readonly bucket: string } & Readonly<Record<ShippingChartKey, number>>;

const EXPENSE_CHART_BRUSH_MIN_POINTS = 8;
const EXPENSE_CHART_DOT_MAX_POINTS = EXPENSE_CHART_BRUSH_MIN_POINTS - 1;

export const shippingMethodChartConfig = {
  na: { label: "n/a", colors: { light: [EXPENSE_CHART_COLORS[0]] } },
  EMS: { label: "EMS", colors: { light: [EXPENSE_CHART_COLORS[1]] } },
  SAL: { label: "SAL", colors: { light: [EXPENSE_CHART_COLORS[2]] } },
  AIRMAIL: { label: "AIRMAIL", colors: { light: [EXPENSE_CHART_COLORS[3]] } },
  SURFACE: { label: "SURFACE", colors: { light: [EXPENSE_CHART_COLORS[4]] } },
  FEDEX: { label: "FEDEX", colors: { light: [EXPENSE_CHART_COLORS[5]] } },
  DHL: { label: "DHL", colors: { light: [EXPENSE_CHART_COLORS[6]] } },
  Colissimo: { label: "Colissimo", colors: { light: [EXPENSE_CHART_COLORS[7]] } },
  UPS: { label: "UPS", colors: { light: [EXPENSE_CHART_COLORS[8]] } },
  Domestic: { label: "Domestic", colors: { light: [EXPENSE_CHART_COLORS[9]] } },
} satisfies ChartConfig;

export function toShippingChartRows(points: readonly ShippingMethodPoint[]): ShippingChartRow[] {
  return points.map((point) => ({
    bucket: point.bucket,
    na: point.values["n/a"],
    EMS: point.values.EMS,
    SAL: point.values.SAL,
    AIRMAIL: point.values.AIRMAIL,
    SURFACE: point.values.SURFACE,
    FEDEX: point.values.FEDEX,
    DHL: point.values.DHL,
    Colissimo: point.values.Colissimo,
    UPS: point.values.UPS,
    Domestic: point.values.Domestic,
  }));
}

export function toShippingItemCountChartRows(
  points: readonly ShippingItemCountPoint[],
): ShippingChartRow[] {
  return points.map((point) => ({
    bucket: `${point.itemCount} ${point.itemCount === 1 ? "item" : "items"}`,
    na: point.values["n/a"],
    EMS: point.values.EMS,
    SAL: point.values.SAL,
    AIRMAIL: point.values.AIRMAIL,
    SURFACE: point.values.SURFACE,
    FEDEX: point.values.FEDEX,
    DHL: point.values.DHL,
    Colissimo: point.values.Colissimo,
    UPS: point.values.UPS,
    Domestic: point.values.Domestic,
  }));
}

export function shippingMethodColor(method: ShippingMethod): string {
  return EXPENSE_CHART_COLORS[SHIPPING_METHODS.indexOf(method)] ?? EXPENSE_CHART_COLORS[0];
}

export function shippingChartKey(method: ShippingMethod): ShippingChartKey {
  return shippingMethodKeys[method];
}

export function shouldShowExpenseBrush(pointCount: number): boolean {
  return pointCount >= EXPENSE_CHART_BRUSH_MIN_POINTS;
}

export function shouldShowExpenseDots(pointCount: number): boolean {
  return pointCount <= EXPENSE_CHART_DOT_MAX_POINTS;
}

export function useShippingMethodVisibility({
  points,
  rankedMethods,
  initialVisibleCount,
}: {
  readonly points: readonly {
    readonly values: Readonly<Record<ShippingMethod, number>>;
  }[];
  readonly rankedMethods: readonly ShippingMethod[];
  readonly initialVisibleCount: number;
}): {
  readonly methods: readonly ShippingMethod[];
  readonly visibleKeys: ReadonlySet<ShippingChartKey>;
  readonly toggle: (key: ShippingChartKey) => void;
} {
  const methods = useMemo(() => {
    const activeMethods = new Set<ShippingMethod>();
    for (const point of points) {
      for (const method of SHIPPING_METHODS) {
        if (point.values[method] > 0) activeMethods.add(method);
      }
    }

    const orderedMethods: ShippingMethod[] = [];
    const seenMethods = new Set<ShippingMethod>();
    for (const method of [...rankedMethods, ...SHIPPING_METHODS]) {
      if (activeMethods.has(method) && !seenMethods.has(method)) {
        orderedMethods.push(method);
        seenMethods.add(method);
      }
    }
    return orderedMethods;
  }, [points, rankedMethods]);
  const activeKeys = useMemo(() => methods.map(shippingChartKey), [methods]);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<ShippingChartKey> | null>(null);
  const visibleKeys = useMemo(
    () => getVisibleShippingKeys(activeKeys, selectedKeys, initialVisibleCount),
    [activeKeys, initialVisibleCount, selectedKeys],
  );
  const toggle = useCallback(
    (key: ShippingChartKey): void => {
      setSelectedKeys((current) => {
        const next = getVisibleShippingKeys(activeKeys, current, initialVisibleCount);
        if (next.has(key)) {
          return next.size > 1
            ? new Set([...next].filter((visibleKey) => visibleKey !== key))
            : next;
        }
        return new Set([...next, key]);
      });
    },
    [activeKeys, initialVisibleCount],
  );

  return { methods, visibleKeys, toggle };
}

function getVisibleShippingKeys(
  activeKeys: readonly ShippingChartKey[],
  selectedKeys: ReadonlySet<ShippingChartKey> | null,
  initialVisibleCount: number,
): Set<ShippingChartKey> {
  if (selectedKeys) {
    const surviving = new Set(activeKeys.filter((key) => selectedKeys.has(key)));
    if (surviving.size > 0) return surviving;
  }

  return new Set(activeKeys.slice(0, initialVisibleCount));
}
