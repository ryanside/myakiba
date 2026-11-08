import { afterEach, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { OverviewTab } from "./overview-tab";

afterEach(cleanup);

test("the overview board describes its scope without browser date math", () => {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
  render(
    <QueryClientProvider client={client}>
      <OverviewTab
        data={undefined}
        dataUpdatedAt={0}
        isLoading
        isError={false}
        error={null}
        currency="USD"
        locale="en-US"
        dateFormat="MM/DD/YYYY"
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText("Recent and upcoming")).not.toBeNull();
  client.clear();
});
