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

export type SyncOrderItem = {
  id: string;
  price: string;
  count: number;
  status: "Owned" | "Ordered" | "Paid" | "Shipped";
  condition: "New" | "Pre-Owned";
  shippingMethod:
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
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
};

export type SyncOrder = {
  status: string;
  title: string;
  shop: string;
  orderDate: string;
  releaseMonthYear: string;
  paymentDate: string;
  shippingDate: string;
  collectionDate: string;
  shippingMethod: string;
  shippingFee: string;
  taxes: string;
  duties: string;
  tariffs: string;
  miscFees: string;
  notes: string;
  items: SyncOrderItem[];
};

export type SyncCollectionItem = {
  itemId: string;
  price: string;
  count: number;
  score: number;
  shop: string;
  orderDate: string | null;
  paymentDate: string | null;
  shippingDate: string | null;
  collectionDate: string | null;
  shippingMethod:
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
  tags: string[];
  condition: "New" | "Pre-Owned";
  notes: string;
};
