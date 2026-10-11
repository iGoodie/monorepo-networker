import { IncomingMessage } from "node:http";
import type { MonorepoMessage } from "../../../../../src";

export function getHttpBody(request: IncomingMessage) {
  return new Promise<MonorepoMessage>((resolve, reject) => {
    const chunks: Array<Uint8Array> = [];
    request
      .on("data", (chunk) => {
        chunks.push(chunk);
      })
      .on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (error) {
          reject(error);
        }
      })
      .on("error", reject);
  });
}
