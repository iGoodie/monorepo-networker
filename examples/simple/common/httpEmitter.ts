import { NetworkError } from "../../../src";
import type { MonorepoMessage, NetworkChannel } from "../../../src";

export function createHttpEmitter(url: string): NetworkChannel.Emitter {
  return async (message: MonorepoMessage) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.status === 204) return undefined;

    const reply: MonorepoMessage = await response.json();
    if (reply.type === "error_response") throw new NetworkError(reply);
    if (reply.type === "ack_response") return undefined;
    if (reply.type === "success_response") return reply.payload[0];
    throw new Error(`Unexpected response type: ${reply.type}`);
  };
}