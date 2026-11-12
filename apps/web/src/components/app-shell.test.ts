import { expect, test } from "bun:test";
import path from "node:path";

const read = (file: string) => Bun.file(path.join(import.meta.dir, "..", file)).text();

// `overflow-x: hidden` makes its element a scroll container, which is what a sticky element sticks
// to, so nothing on a page could stick to the window. `clip` cuts the same overflow without that, but
// it no longer lets the element shrink below its content, so the shell has to say how wide it is.
test("no wrapper around a page turns into a scroll container", async () => {
  const route = await read("routes/(app)/route.tsx");
  expect(route).not.toContain("overflow-x-hidden");
  expect(route.match(/overflow-x-clip/gu)).toHaveLength(3);
  expect(route).toContain("w-full min-w-0 max-w-full overflow-x-clip");

  const sidebar = await read("components/ui/sidebar.tsx");
  const inset = sidebar.slice(sidebar.indexOf("function SidebarInset("));
  const insetClasses = inset.slice(0, inset.indexOf("{...props}"));
  expect(insetClasses).not.toContain("overflow-x-hidden");
  expect(insetClasses).toContain("overflow-x-clip");
});
