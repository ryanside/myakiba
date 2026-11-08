import { MAX_PICK_STORE_BYTES } from "@myakiba/contracts/add/constants";
import { tagged } from "./tagged";

export class PickStoreFull extends tagged("PickStoreFull")<{
  bytes: number;
  storedBytes: number;
  message: string;
}> {
  constructor(args: { bytes: number; storedBytes: number }) {
    super({
      ...args,
      message: `The extension did not keep a ${args.bytes}-byte pick, because its picks already take ${args.storedBytes} of the ${MAX_PICK_STORE_BYTES} bytes it keeps. The picks it has stay. Collect them on myakiba's Add page, or unpick some, to make room.`,
    });
  }
}
