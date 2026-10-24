import { tagged } from "./tagged";

type Unavailability = "taken" | "closed" | "left_origin" | "ended_at_start";

const WHY = {
  taken: "the user took it",
  closed: "it closed while it loaded",
  left_origin: "its load ended off MFC's origin",
  ended_at_start: "its load ended back on the page it started from, as a 204 or a download does",
} as const satisfies Record<Unavailability, string>;

export class MfcTabUnavailable extends tagged("MfcTabUnavailable")<{
  tabId: number;
  reason: Unavailability;
  message: string;
}> {
  constructor(args: { tabId: number; reason: Unavailability }) {
    super({
      ...args,
      message: `The extension gave up MFC tab ${args.tabId} because ${WHY[args.reason]}. The item was not fetched, and a tab the user took is left to them. The next item opens a fresh tab.`,
    });
  }
}
