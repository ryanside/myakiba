import { expect, test } from "bun:test";
import { transformCSVData } from "./sync";

const CSV_HEADER =
  "ID,Title,Root,Category,Release Date,Price,Scale,Barcode,Status,Count,Score,Payment Date,Shipping Date,Collecting Date,Price,Shop,Shipping Method,Tracking Number,Wishibility,Note";
const csvLine = (id: number, title: string, status: string) =>
  `${id},"${title}",Figures,Prepainted,2024-01-01,"¥10,000",1/7,,${status},1,8/10,2024-02-01,,,"$80.00",AmiAmi,EMS,,,`;
const csvFile = (lines: readonly string[]) =>
  new File([[CSV_HEADER, ...lines].join("\n")], "mfc.csv", { type: "text/csv" });

test("keeps items behind an MFC content label and drops wished ones", async () => {
  const userItems = await transformCSVData({
    file: csvFile([
      csvLine(98_777, "[NSFW+] Hello, Good-bye", "Owned"),
      csvLine(2, "Public figure", "Ordered"),
      csvLine(4, "Wished figure", "Wished"),
    ]),
  });

  expect(userItems.map((item) => [item.itemExternalId, item.status])).toEqual([
    [98_777, "Owned"],
    [2, "Ordered"],
  ]);
});
