import { expect, test } from "bun:test";
import { createImportId } from "./import-plan";

test("import ids match the frozen worker vector", () => {
  expect(
    createImportId({
      userId: "user-1",
      importId: "worker-partial",
      kind: "collection",
      localKey: "c1",
    }),
  ).toBe("e922beed-d0a7-5087-9f12-cde7f3774216");
});
