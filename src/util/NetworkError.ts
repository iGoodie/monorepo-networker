import { MonorepoMessage } from "../new/types";
import { NetworkMessage } from "../types";

/** @deprecated */
export class NetworkError_OLD extends Error {
  constructor(message: NetworkMessage) {
    super(message.payload[0]);
  }
}

export class NetworkError extends Error {
  constructor(message: MonorepoMessage) {
    super(message.payload[0]);
  }
}
