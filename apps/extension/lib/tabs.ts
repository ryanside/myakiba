import { Result } from "better-result";
import { TabClosed } from "./errors/tab-closed";
import { TabEditRefused } from "./errors/tab-edit-refused";
import { TabOpenFailed } from "./errors/tab-open-failed";
import { TabQueryFailed } from "./errors/tab-query-failed";
import { WindowFocusRefused } from "./errors/window-focus-refused";

export type Tab = {
  readonly id?: number;
  readonly windowId?: number;
  readonly status?: string;
  readonly url?: string;
  readonly pendingUrl?: string;
  readonly title?: string;
  readonly active?: boolean;
  readonly incognito?: boolean;
  readonly cookieStoreId?: string;
};

type TabQuery = { url: string; status: "complete"; discarded: false };

type NewTab = { url: string; active: boolean; windowId: number; cookieStoreId?: string };

type TabChange = { url?: string; active?: boolean };

/** The part of `browser.tabs` the extension uses, which rejects when the browser refuses a call. */
export type TabsApi = {
  readonly get: (tabId: number) => Promise<Tab>;
  readonly query: (query: TabQuery) => Promise<Tab[]>;
  readonly create: (properties: NewTab) => Promise<Tab>;
  readonly update: (tabId: number, properties: TabChange) => Promise<Tab | undefined>;
  readonly remove: (tabId: number) => Promise<void>;
};

export type WindowsApi = {
  readonly update: (windowId: number, info: { focused: boolean }) => Promise<{ id?: number }>;
};

/** `browser.tabs` and `browser.windows`, answering each refusal as a tagged error. */
export type Tabs = ReturnType<typeof resultTabs>;

export function resultTabs(tabs: TabsApi, windows: WindowsApi) {
  return {
    get: (tabId: number) =>
      Result.tryPromise({
        try: () => tabs.get(tabId),
        catch: (cause) => new TabClosed({ tabId, cause }),
      }),
    query: (query: TabQuery) =>
      Result.tryPromise({
        try: () => tabs.query(query),
        catch: (cause) => new TabQueryFailed({ cause }),
      }),
    create: (properties: NewTab) =>
      Result.tryPromise({
        try: () => tabs.create(properties),
        catch: (cause) => new TabOpenFailed({ windowId: properties.windowId, cause }),
      }),
    update: (tabId: number, properties: TabChange) =>
      Result.tryPromise({
        try: () => tabs.update(tabId, properties),
        catch: (cause) => new TabEditRefused({ tabId, op: "update", cause }),
      }),
    remove: (tabId: number) =>
      Result.tryPromise({
        try: () => tabs.remove(tabId),
        catch: (cause) => new TabEditRefused({ tabId, op: "remove", cause }),
      }),
    focusWindow: (windowId: number) =>
      Result.tryPromise({
        try: () => windows.update(windowId, { focused: true }),
        catch: (cause) => new WindowFocusRefused({ windowId, cause }),
      }),
  };
}
