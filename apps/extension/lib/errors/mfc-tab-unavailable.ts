import { tagged } from "./tagged";

export class MfcTabUnavailable extends tagged("MfcTabUnavailable")<{
  tabId: number;
  reason: "taken" | "ended_elsewhere";
  message: string;
}> {
  constructor(args: { tabId: number; reason: "taken" | "ended_elsewhere" }) {
    const what =
      args.reason === "taken"
        ? "the user took it"
        : "its load ended off MFC's origin or back on the page it started from";
    super({
      ...args,
      message: `The extension gave up MFC tab ${args.tabId} because ${what}. The item was not fetched, and the tab is left to the user. The next item opens a fresh tab.`,
    });
  }
}
