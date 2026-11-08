import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { AverageCollectionItemCostByPeriod } from "./average-collection-item-cost-by-period";
import { AverageCollectionItemCostToDate } from "./average-collection-item-cost-to-date";

afterEach(cleanup);

for (const Chart of [AverageCollectionItemCostByPeriod, AverageCollectionItemCostToDate]) {
  test(`${Chart.name} omits the redundant single-series legend`, () => {
    render(
      <Chart
        data={[{ bucket: "2026-01", collectionItems: 100 }]}
        isLoading={false}
        currency="USD"
        locale="en-US"
        selector={null}
      />,
    );
    expect(screen.queryByText("Collection Items") === null).toBe(true);
  });
}
