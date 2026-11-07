import { expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import {
  decodedImages,
  flushFrame,
  images,
  renderSidebar,
  stalled,
} from "../../../test/sidebar-app";

const dashboardBackground = "11-akihabara-bright-bitgrain.webp";
const analyticsBackground = "56-blossoms-and-wires-bitgrain.webp";
const ordersBackground = "17-night-calendar-bitgrain.webp";
const settingsBackground = "10-settings-desk-bitgrain.webp";

function decodedSources() {
  return decodedImages.map((image) => image.src);
}

function downloadedSources() {
  return images.filter((image) => !decodedImages.includes(image)).map((image) => image.src);
}

async function renderWarmedSidebar() {
  const { ordersImported } = await renderSidebar();
  await act(() => ordersImported);
}

async function clickOrdersAndFlushFrame() {
  await act(async () => {
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
  });
  await act(async () => {
    flushFrame();
  });
  return performance.now();
}

test("a background that never finishes downloading does not hold the page", async () => {
  stalled.add(ordersBackground);
  await renderWarmedSidebar();

  const frameFlushedAt = await clickOrdersAndFlushFrame();
  await screen.findByRole("heading", { name: "Orders" }, { timeout: 1000 });
  expect(
    performance.now() - frameFlushedAt,
    "the page renders within 200 ms of the frame flush",
  ).toBeLessThan(200);
});

test("a downloaded background decodes before the page renders", async () => {
  await renderWarmedSidebar();
  const decode = Promise.withResolvers<null>();
  Image.prototype.decode = async function () {
    decodedImages.push(this);
    await decode.promise;
  };

  await clickOrdersAndFlushFrame();
  await act(() => Bun.sleep(5));
  expect(decodedSources()).toEqual([
    expect.stringContaining(dashboardBackground),
    expect.stringContaining(ordersBackground),
  ]);
  expect(screen.queryByRole("heading", { name: "Orders" }), "the page waits for the decode").toBe(
    null,
  );

  await act(async () => {
    decode.resolve(null);
  });
  await screen.findByRole("heading", { name: "Orders" });
});

test("a background that fails to decode does not block the page", async () => {
  await renderWarmedSidebar();
  Image.prototype.decode = async function () {
    decodedImages.push(this);
    throw new Error("decode failed");
  };

  await clickOrdersAndFlushFrame();
  await screen.findByRole("heading", { name: "Orders" });
});

test("warm-up starts every background download together after the route code, without decoding", async () => {
  const ordersCode = Promise.withResolvers<null>();
  stalled.add("-bitgrain.webp");
  const { ordersImported } = await renderSidebar(ordersCode.promise);
  await act(() => Bun.sleep(50));
  expect(downloadedSources(), "no background downloads while route code warms").toEqual([]);

  ordersCode.resolve(null);
  await act(() => ordersImported);
  await waitFor(() => expect(downloadedSources()).toHaveLength(11));
  expect(downloadedSources()).toContainEqual(expect.stringContaining(ordersBackground));
  expect(decodedSources(), "warm-up never decodes").toEqual([
    expect.stringContaining(dashboardBackground),
  ]);
});

test("a background that never downloads does not hold back the others", async () => {
  stalled.add(analyticsBackground);
  await renderWarmedSidebar();
  await waitFor(() => expect(downloadedSources()).toHaveLength(11));
  expect(downloadedSources()).toContainEqual(expect.stringContaining(settingsBackground));
});

test("a preload neither downloads nor decodes its background", async () => {
  const { router } = await renderSidebar(new Promise(() => {}));
  await act(() => router.preloadRoute({ to: "/settings" }));
  expect(images.map((image) => image.src)).not.toContainEqual(
    expect.stringContaining(settingsBackground),
  );
  expect(decodedSources()).toEqual([expect.stringContaining(dashboardBackground)]);
});

test("a search-only navigation neither decodes nor waits for a background", async () => {
  const { router } = await renderSidebar();
  await act(() => router.navigate({ to: "/dashboard", search: { tab: "monthly" } }));
  expect(router.state.resolvedLocation?.search).toEqual({ tab: "monthly" });
  expect(decodedSources()).toEqual([expect.stringContaining(dashboardBackground)]);
});
