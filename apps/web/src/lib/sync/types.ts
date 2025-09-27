import { z } from "zod";

export const csvItemSchema = z.object({
    id: z.string(),
    title: z.string(),
    root: z.string(),
    category: z.string(),
    release_date: z.string(),
    price: z.string(),
    scale: z.string(),
    barcode: z.string(),
    status: z.enum(["Owned", "Ordered"]),
    count: z.string(),
    score: z.string(),
    payment_date: z.string(),
    shipping_date: z.string(),
    collecting_date: z.string(),
    price_1: z.string(),
    shop: z.string(),
    shipping_method: z.enum([
      "n/a",
      "EMS",
      "SAL",
      "AIRMAIL",
      "SURFACE",
      "FEDEX",
      "DHL",
      "Colissimo",
      "UPS",
      "Domestic",
    ]),
    tracking_number: z.string(),
    wishibility: z.string().optional(),
    note: z.string(),
  });
  export const csvSchema = z.array(csvItemSchema);
  
  export type userItem = {
    id: number;
    status: "Owned" | "Ordered";
    count: number;
    score: string;
    payment_date: string;
    shipping_date: string;
    collecting_date: string;
    price: string;
    shop: string;
    shipping_method:
      | "n/a"
      | "EMS"
      | "SAL"
      | "AIRMAIL"
      | "SURFACE"
      | "FEDEX"
      | "DHL"
      | "Colissimo"
      | "UPS"
      | "Domestic";
    note: string;
    orderId: null;
    orderDate: string;
  };
  
  export type status = {
    existingItems?: number;
    newItems?: number;
    isFinished: boolean;
    status: string;
  };