import type { Job } from "bullmq";

export interface scrapedItem {
  id: number;
  title: string;
  category: string;
  classification: {
    id: number;
    name: string;
    role: string;
  }[];
  origin: {
    id: number;
    name: string;
  }[];
  character: {
    id: number;
    name: string;
  }[];
  company: {
    id: number;
    name: string;
    role: string;
  }[];
  artist: {
    id: number;
    name: string;
    role: string;
  }[];
  version: string[];
  releaseDate: {
    date: string;
    type: string;
    price: number;
    priceCurrency: string;
    barcode: string;
  }[];
  event: {
    id: number;
    name: string;
    role: string;
  }[];
  materials: {
    id: number;
    name: string;
  }[];
  scale: string;
  height: number;
  width: number;
  depth: number;
  image: string;
}

export interface jobData extends Job {
  data: {
    type: "csv" | "order" | "collection";
    userId: string;
    items: {
      id: number;
      status: string;
      count: number;
      score: string;
      payment_date: string | null;
      shipping_date: string | null;
      collecting_date: string | null;
      price: string;
      shop: string;
      shipping_method: string;
      note: string;
      orderId: string | null;
      orderDate: string | null;
    }[];
  };
}
