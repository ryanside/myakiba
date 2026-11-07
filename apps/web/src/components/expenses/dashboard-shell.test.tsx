import { afterEach, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { ChartSeriesLegend } from "./dashboard-shell";

afterEach(cleanup);

test("a one-method shipping legend shows its method label", () => {
  render(<ChartSeriesLegend items={[{ key: "EMS", label: "EMS", color: "red" }]} />);
  expect(screen.getByText("EMS")).not.toBeNull();
});
