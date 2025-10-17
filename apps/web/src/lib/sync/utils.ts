import Papa from "papaparse";
import { csvSchema, type userItem } from "./types";

export async function transformCSVData(value: { file: File | undefined }) {
  if (!value.file) {
    throw new Error("No file selected");
  }
  const text = await value.file.text();
  const parsedCSV = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) =>
      header.trim().toLowerCase().replace(/ /g, "_"),
  });

  const validatedCSV = csvSchema.safeParse(parsedCSV.data);
  if (!validatedCSV.success) {
    console.log("Invalid CSV file", validatedCSV.error);
    throw new Error("Please select a valid MyFigureCollection CSV file");
  }

  const filteredData = validatedCSV.data.filter((item) => {
    return (
      (item.status === "Owned" || item.status === "Ordered") &&
      !item.title.startsWith("[NSFW")
    );
  });
  if (filteredData.length === 0) {
    throw new Error("No Owned or Ordered items to sync");
  }
  console.log("Filtered data:", filteredData);
  const userItems: userItem[] = filteredData.map((item) => {
    return {
      id: Number(item.id),
      status: item.status as "Owned" | "Ordered",
      count: Number(item.count),
      score: item.score.split("/")[0],
      payment_date: item.payment_date,
      shipping_date: item.shipping_date,
      collecting_date: item.collecting_date,
      price: item.price_1,
      shop: item.shop,
      shipping_method: item.shipping_method as
        | "n/a"
        | "EMS"
        | "SAL"
        | "AIRMAIL"
        | "SURFACE"
        | "FEDEX"
        | "DHL"
        | "Colissimo"
        | "UPS"
        | "Domestic",
      note: item.note,
      orderId: null,
      orderDate: item.payment_date,
    };
  });
  return userItems;
}
