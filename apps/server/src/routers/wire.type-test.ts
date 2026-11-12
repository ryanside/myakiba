/**
 * The wire of every operation a route serves: each failure's status and literal
 * message, the 500, and each string answer's literal. Written against the kernel
 * before better-result and never edited since, so a change to any of them fails
 * `tsc -b` at that operation. The calls are never run; only their types are read.
 */

import type { ElysiaCustomStatusResponse as S } from "elysia";
import { serve } from "@/domain/kernel";
import type { Op } from "@/domain/kernel";
import { Add } from "@/routers/add/module";
import { Analytics } from "@/routers/analytics/module";
import { Calendar } from "@/routers/calendar/module";
import { Collection } from "@/routers/collection/module";
import { Dashboard } from "@/routers/dashboard/module";
import { Expenses } from "@/routers/expenses/module";
import { Items } from "@/routers/item/module";
import { Lists } from "@/routers/lists/module";
import { MfcItems } from "@/routers/mfc-items/module";
import { Orders } from "@/routers/orders/module";
import { Search } from "@/routers/search/module";
import { Settings } from "@/routers/settings/module";
import { Wishlist } from "@/routers/wishlist/module";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type Answer<F> = F extends () => Promise<infer A> ? A : never;
/** Every status answer: one per failure, plus the 500. */
type Failures<F> =
  Answer<F> extends infer A ? (A extends S<infer _C, infer _T, infer _S> ? A : never) : never;
/** A string answer: a message body Eden must see as its literal. */
type Strings<F> = Extract<Answer<F>, string>;

type InputOf<O> = O extends Op<infer I, infer _T, infer _F, infer _M> ? I : never;

declare const caller: Parameters<typeof serve>[0];
declare function inputOf<O>(op: O): InputOf<O>;

// Add
const addItems = () => serve(caller, Add.items, inputOf(Add.items));
const addCommit = () => serve(caller, Add.commit, inputOf(Add.commit));
void (true satisfies Equal<
  {
    items: Failures<typeof addItems>;
    commit: Failures<typeof addCommit>;
  },
  {
    items: S<500, "Failed to load the items to add">;
    commit:
      | S<404, "Some items are no longer in the item database">
      | S<404, "A chosen release is not a release of its item">
      | S<404, "Order not found">
      | S<404, "List or selection not found">
      | S<409, "These items were already added with different choices">
      | S<500, "Failed to add the items">;
  }
>);

// Analytics
const analyticsOverview = () => serve(caller, Analytics.overview, inputOf(Analytics.overview));
const analyticsSection = () => serve(caller, Analytics.section, inputOf(Analytics.section));
const analyticsSectionItems = () =>
  serve(caller, Analytics.sectionItems, inputOf(Analytics.sectionItems));
const analyticsSectionRelationships = () =>
  serve(caller, Analytics.sectionRelationships, inputOf(Analytics.sectionRelationships));
void (true satisfies Equal<
  {
    overview: Failures<typeof analyticsOverview>;
    section: Failures<typeof analyticsSection>;
    sectionItems: Failures<typeof analyticsSectionItems>;
    sectionRelationships: Failures<typeof analyticsSectionRelationships>;
  },
  {
    overview: S<500, "Failed to get analytics">;
    section: S<500, "Failed to get analytics section">;
    sectionItems: S<500, "Failed to get analytics section items">;
    sectionRelationships:
      | S<400, "Related section must differ from source section">
      | S<500, "Failed to get analytics section relationships">;
  }
>);

// Calendar
const calendarItems = () => serve(caller, Calendar.items, inputOf(Calendar.items));
const calendarOrders = () => serve(caller, Calendar.orders, inputOf(Calendar.orders));
void (true satisfies Equal<
  {
    items: Failures<typeof calendarItems>;
    orders: Failures<typeof calendarOrders>;
  },
  {
    items: S<500, "Failed to get calendar items">;
    orders: S<500, "Failed to get calendar orders">;
  }
>);

// Collection
const collectionList = () => serve(caller, Collection.list, inputOf(Collection.list));
const collectionGet = () => serve(caller, Collection.get, inputOf(Collection.get));
const collectionUpdate = () => serve(caller, Collection.update, inputOf(Collection.update));
const collectionRemove = () => serve(caller, Collection.remove, inputOf(Collection.remove));
const collectionRemoveMany = () =>
  serve(caller, Collection.removeMany, inputOf(Collection.removeMany));
void (true satisfies Equal<
  {
    list: Failures<typeof collectionList>;
    get: Failures<typeof collectionGet>;
    update: Failures<typeof collectionUpdate>;
    remove: Failures<typeof collectionRemove>;
    removeMany: Failures<typeof collectionRemoveMany>;
  },
  {
    list: S<500, "Failed to get collection table">;
    get: S<404, "Collection item not found"> | S<500, "Failed to get collection item">;
    update:
      | S<404, "A chosen release is not a release of its item">
      | S<404, "Collection item not found">
      | S<500, "Failed to update collection item">;
    remove: S<404, "Collection item not found"> | S<500, "Failed to delete collection item">;
    removeMany:
      | S<404, "Collection item(s) not found">
      | S<500, "Failed to delete collection item(s)">;
  }
>);
void (true satisfies Equal<
  {
    removeMany: Strings<typeof collectionRemoveMany>;
  },
  {
    removeMany: "Collection item(s) deleted successfully";
  }
>);

// Dashboard
const dashboardOverview = () => serve(caller, Dashboard.overview, inputOf(Dashboard.overview));
const dashboardReleaseCalendar = () =>
  serve(caller, Dashboard.releaseCalendar, inputOf(Dashboard.releaseCalendar));
const dashboardMonthly = () => serve(caller, Dashboard.monthly, inputOf(Dashboard.monthly));
void (true satisfies Equal<
  {
    overview: Failures<typeof dashboardOverview>;
    releaseCalendar: Failures<typeof dashboardReleaseCalendar>;
    monthly: Failures<typeof dashboardMonthly>;
  },
  {
    overview: S<500, "Failed to get dashboard data">;
    releaseCalendar: S<500, "Failed to get release calendar data">;
    monthly: S<500, "Failed to get monthly dashboard data">;
  }
>);

// Expenses
const expensesFilterOptions = () =>
  serve(caller, Expenses.filterOptions, inputOf(Expenses.filterOptions));
const expensesCollection = () => serve(caller, Expenses.collection, inputOf(Expenses.collection));
const expensesShops = () => serve(caller, Expenses.shops, inputOf(Expenses.shops));
const expensesOrders = () => serve(caller, Expenses.orders, inputOf(Expenses.orders));
const expensesShipping = () => serve(caller, Expenses.shipping, inputOf(Expenses.shipping));
const expensesShopExpansion = () =>
  serve(caller, Expenses.shopExpansion, inputOf(Expenses.shopExpansion));
void (true satisfies Equal<
  {
    filterOptions: Failures<typeof expensesFilterOptions>;
    collection: Failures<typeof expensesCollection>;
    shops: Failures<typeof expensesShops>;
    orders: Failures<typeof expensesOrders>;
    shipping: Failures<typeof expensesShipping>;
    shopExpansion: Failures<typeof expensesShopExpansion>;
  },
  {
    filterOptions: S<500, "Failed to get expense filter options">;
    collection: S<500, "Failed to get collection expenses">;
    shops: S<500, "Failed to get expense shops">;
    orders: S<500, "Failed to get order expenses">;
    shipping: S<500, "Failed to get expenses shipping">;
    shopExpansion: S<500, "Failed to get shop expansion">;
  }
>);

// Items
const itemsReleases = () => serve(caller, Items.releases, inputOf(Items.releases));
const itemsGet = () => serve(caller, Items.get, inputOf(Items.get));
const itemsRelatedOrders = () => serve(caller, Items.relatedOrders, inputOf(Items.relatedOrders));
const itemsRelatedCollection = () =>
  serve(caller, Items.relatedCollection, inputOf(Items.relatedCollection));
const itemsResync = () => serve(caller, Items.resync, inputOf(Items.resync));
void (true satisfies Equal<
  {
    releases: Failures<typeof itemsReleases>;
    get: Failures<typeof itemsGet>;
    relatedOrders: Failures<typeof itemsRelatedOrders>;
    relatedCollection: Failures<typeof itemsRelatedCollection>;
    resync: Failures<typeof itemsResync>;
  },
  {
    releases: S<500, "Failed to get item releases">;
    get: S<404, "Item not found"> | S<500, "Failed to get item">;
    relatedOrders: S<500, "Failed to get item related orders">;
    relatedCollection: S<500, "Failed to get item related collections">;
    resync:
      | S<
          400,
          | "MyFigureCollection did not show this item"
          | "MyFigureCollection showed a security check instead of the item"
          | "The item page has no category"
          | "The item page has no title"
          | "The page is for a different item"
          | "The page is larger than any MyFigureCollection item page"
          | "The page is not a MyFigureCollection item page"
          | "This item category is not supported"
          | "Turn off SFW mode in your MyFigureCollection menu to save this NSFW item",
          400
        >
      | S<404, "Item not found">
      | S<500, "Failed to request item refresh">;
  }
>);

// Lists
const listsList = () => serve(caller, Lists.list, inputOf(Lists.list));
const listsCreate = () => serve(caller, Lists.create, inputOf(Lists.create));
const listsMove = () => serve(caller, Lists.move, inputOf(Lists.move));
const listsTargetOptions = () => serve(caller, Lists.targetOptions, inputOf(Lists.targetOptions));
const listsAddTargets = () => serve(caller, Lists.addTargets, inputOf(Lists.addTargets));
const listsRemoveTargets = () => serve(caller, Lists.removeTargets, inputOf(Lists.removeTargets));
const listsGet = () => serve(caller, Lists.get, inputOf(Lists.get));
const listsUpdate = () => serve(caller, Lists.update, inputOf(Lists.update));
const listsRemove = () => serve(caller, Lists.remove, inputOf(Lists.remove));
const listsRemoveMembers = () => serve(caller, Lists.removeMembers, inputOf(Lists.removeMembers));
const listsMembers = () => serve(caller, Lists.members, inputOf(Lists.members));
const listsMoveMembers = () => serve(caller, Lists.moveMembers, inputOf(Lists.moveMembers));
void (true satisfies Equal<
  {
    list: Failures<typeof listsList>;
    create: Failures<typeof listsCreate>;
    move: Failures<typeof listsMove>;
    targetOptions: Failures<typeof listsTargetOptions>;
    addTargets: Failures<typeof listsAddTargets>;
    removeTargets: Failures<typeof listsRemoveTargets>;
    get: Failures<typeof listsGet>;
    update: Failures<typeof listsUpdate>;
    remove: Failures<typeof listsRemove>;
    removeMembers: Failures<typeof listsRemoveMembers>;
    members: Failures<typeof listsMembers>;
    moveMembers: Failures<typeof listsMoveMembers>;
  },
  {
    list: S<500, "Failed to get lists">;
    create: S<500, "Failed to create list">;
    move: S<404, "List not found"> | S<500, "Failed to move lists">;
    targetOptions: S<404, "Selection not found"> | S<500, "Failed to get List options">;
    addTargets: S<404, "List or selection not found"> | S<500, "Failed to add to Lists">;
    removeTargets: S<404, "List not found"> | S<500, "Failed to remove from List">;
    get: S<404, "List not found"> | S<500, "Failed to get list">;
    update: S<404, "List not found"> | S<500, "Failed to update list">;
    remove: S<404, "List not found"> | S<500, "Failed to delete lists">;
    removeMembers: S<404, "Selection not found"> | S<500, "Failed to remove from List">;
    members: S<404, "List not found"> | S<500, "Failed to load List">;
    moveMembers: S<404, "List or selection not found"> | S<500, "Failed to save List order">;
  }
>);
void (true satisfies Equal<
  {
    move: Strings<typeof listsMove>;
    moveMembers: Strings<typeof listsMoveMembers>;
  },
  {
    move: "List order saved";
    moveMembers: "List order saved";
  }
>);

// MfcItems
const mfcItemsIngest = () => serve(caller, MfcItems.ingest, inputOf(MfcItems.ingest));
void (true satisfies Equal<
  {
    ingest: Failures<typeof mfcItemsIngest>;
  },
  {
    ingest:
      | S<
          400,
          | "MyFigureCollection did not show this item"
          | "MyFigureCollection showed a security check instead of the item"
          | "The item page has no category"
          | "The item page has no title"
          | "The page is for a different item"
          | "The page is larger than any MyFigureCollection item page"
          | "The page is not a MyFigureCollection item page"
          | "This item category is not supported"
          | "Turn off SFW mode in your MyFigureCollection menu to save this NSFW item",
          400
        >
      | S<409, "Your Item Database is full. One account can hold 20,000 Items.">
      | S<500, "Failed to save item">;
  }
>);

// Orders
const ordersList = () => serve(caller, Orders.list, inputOf(Orders.list));
const ordersGet = () => serve(caller, Orders.get, inputOf(Orders.get));
const ordersItems = () => serve(caller, Orders.items, inputOf(Orders.items));
const ordersItemReleases = () => serve(caller, Orders.itemReleases, inputOf(Orders.itemReleases));
const ordersMerge = () => serve(caller, Orders.merge, inputOf(Orders.merge));
const ordersSplit = () => serve(caller, Orders.split, inputOf(Orders.split));
const ordersMoveItems = () => serve(caller, Orders.moveItems, inputOf(Orders.moveItems));
const ordersUpdate = () => serve(caller, Orders.update, inputOf(Orders.update));
const ordersRemove = () => serve(caller, Orders.remove, inputOf(Orders.remove));
const ordersRemoveItems = () => serve(caller, Orders.removeItems, inputOf(Orders.removeItems));
const ordersRemoveItem = () => serve(caller, Orders.removeItem, inputOf(Orders.removeItem));
void (true satisfies Equal<
  {
    list: Failures<typeof ordersList>;
    get: Failures<typeof ordersGet>;
    items: Failures<typeof ordersItems>;
    itemReleases: Failures<typeof ordersItemReleases>;
    merge: Failures<typeof ordersMerge>;
    split: Failures<typeof ordersSplit>;
    moveItems: Failures<typeof ordersMoveItems>;
    update: Failures<typeof ordersUpdate>;
    remove: Failures<typeof ordersRemove>;
    removeItems: Failures<typeof ordersRemoveItems>;
    removeItem: Failures<typeof ordersRemoveItem>;
  },
  {
    list: S<500, "Failed to get orders">;
    get: S<404, "Order not found"> | S<500, "Failed to get order">;
    items: S<500, "Failed to get order items">;
    itemReleases: S<500, "Failed to get order item releases">;
    merge:
      | S<404, "One or more orders not found">
      | S<404, "Order items not found">
      | S<500, "Failed to merge orders">;
    split: S<404, "Order items not found"> | S<500, "Failed to split orders">;
    moveItems:
      | S<404, "Order items not found">
      | S<404, "Order not found">
      | S<500, "Failed to move items">;
    update: S<404, "Order not found"> | S<500, "Failed to update order">;
    remove: S<404, "One or more orders not found"> | S<500, "Failed to delete orders">;
    removeItems:
      | S<404, "One or more order items not found">
      | S<500, "Failed to delete order items">;
    removeItem: S<404, "Order item not found"> | S<500, "Failed to delete order item">;
  }
>);
void (true satisfies Equal<
  {
    merge: Strings<typeof ordersMerge>;
    split: Strings<typeof ordersSplit>;
    moveItems: Strings<typeof ordersMoveItems>;
    update: Strings<typeof ordersUpdate>;
    remove: Strings<typeof ordersRemove>;
    removeItems: Strings<typeof ordersRemoveItems>;
    removeItem: Strings<typeof ordersRemoveItem>;
  },
  {
    merge: "Orders merged successfully";
    split: "Items split successfully";
    moveItems: "Items moved successfully";
    update: "Order updated successfully";
    remove: "Orders deleted successfully";
    removeItems: "Order items deleted successfully";
    removeItem: "Order item deleted successfully";
  }
>);

// Search
const searchCommand = () => serve(caller, Search.command, inputOf(Search.command));
const searchEntries = () => serve(caller, Search.entries, inputOf(Search.entries));
const searchItems = () => serve(caller, Search.items, inputOf(Search.items));
const searchOrders = () => serve(caller, Search.orders, inputOf(Search.orders));
void (true satisfies Equal<
  {
    command: Failures<typeof searchCommand>;
    entries: Failures<typeof searchEntries>;
    items: Failures<typeof searchItems>;
    orders: Failures<typeof searchOrders>;
  },
  {
    command: S<500, "Failed to search">;
    entries: S<500, "Failed to search entries">;
    items: S<500, "Failed to search item database">;
    orders: S<500, "Failed to search orders">;
  }
>);

// Settings
const settingsAccountType = () =>
  serve(caller, Settings.accountType, inputOf(Settings.accountType));
void (true satisfies Equal<
  {
    accountType: Failures<typeof settingsAccountType>;
  },
  {
    accountType: S<500, "Failed to check account type">;
  }
>);

// Wishlist
const wishlistList = () => serve(caller, Wishlist.list, inputOf(Wishlist.list));
const wishlistMove = () => serve(caller, Wishlist.move, inputOf(Wishlist.move));
const wishlistAdd = () => serve(caller, Wishlist.add, inputOf(Wishlist.add));
const wishlistRemove = () => serve(caller, Wishlist.remove, inputOf(Wishlist.remove));
void (true satisfies Equal<
  {
    list: Failures<typeof wishlistList>;
    move: Failures<typeof wishlistMove>;
    add: Failures<typeof wishlistAdd>;
    remove: Failures<typeof wishlistRemove>;
  },
  {
    list: S<500, "Failed to load Wishlist">;
    move: S<404, "Wishlist Item not found"> | S<500, "Failed to save Wishlist order">;
    add: S<404, "Item not found"> | S<500, "Failed to add to Wishlist">;
    remove: S<500, "Failed to remove from Wishlist">;
  }
>);
void (true satisfies Equal<
  {
    move: Strings<typeof wishlistMove>;
  },
  {
    move: "Wishlist order saved";
  }
>);
