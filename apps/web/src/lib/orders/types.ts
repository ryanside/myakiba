export type OrdersQueryResponse = {
    orders: Order[];
    totalCount: number;
    pagination: {
      limit: number;
      offset: number;
      pageCount: number;
    };
  };
  
  export type Order = {
    orderId: string;
    title: string;
    shop: string | null;
    releaseMonthYear: string | null;
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
    status: "Ordered" | "Paid" | "Shipped" | "Owned";
    total: string;
    shippingFee: string;
    taxes: string;
    duties: string;
    tariffs: string;
    miscFees: string;
    notes: string | null;
    itemCount: number;
    createdAt: string;
    items: OrderItem[];
    totalCount: number;
  };
  
  export type OrderItem = {
    collectionId: string;
    itemId: number;
    releaseId: string | null;
    status: "Owned" | "Ordered" | "Paid" | "Shipped" | "Sold";
    title: string;
    image: string | null;
    price: string;
    count: number;
    shop: string | null;
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
    releaseDate: string | null;
    releaseType: string | null;
    releasePrice: string | null;
    releasePriceCurrency: string | null;
    releaseBarcode: string | null;
    condition: "New" | "Pre-Owned" | null;
  };
  
  export type NewOrder = {
    title: string;
    shop: string | null;
    releaseMonthYear: string | null;
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
    status: "Ordered" | "Paid" | "Shipped" | "Owned";
    shippingFee: string;
    taxes: string;
    duties: string;
    tariffs: string;
    miscFees: string;
    notes: string | null;
  };
  
  export type EditedOrder = NewOrder & {
    orderId: string;
  };
  
  export type Filters = {
    limit?: number | undefined;
    offset?: number | undefined;
    sort?:
      | "title"
      | "shop"
      | "orderDate"
      | "releaseMonthYear"
      | "shippingMethod"
      | "total"
      | "itemCount"
      | "createdAt"
      | undefined;
    order?: "asc" | "desc" | undefined;
    search?: string | undefined;
  };
  
  export type CascadeOptions = Array<
    | "status"
    | "shop"
    | "orderDate"
    | "paymentDate"
    | "shippingDate"
    | "collectionDate"
    | "shippingMethod"
  >;
  
  export type ItemRelease = {
    id: string;
    itemId: number;
    date: string;
    type: string | null;
    price: string | null;
    priceCurrency: string | null;
    barcode: string | null;
  };
  
  export type ItemReleasesResponse = {
    releases: ItemRelease[];
  };
  