import { MonorepoMessage } from "../types";

export class NetworkError extends Error {
  constructor(message: MonorepoMessage) {
    super(message.payload[0]);
  }
}
