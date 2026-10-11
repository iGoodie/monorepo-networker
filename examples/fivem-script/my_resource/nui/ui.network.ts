import { CLIENT, NUI } from "@common/networkSides";
import { NetworkError } from "../../../../src";
import type { MonorepoMessage } from "../../../../src";

declare function GetParentResourceName(): string;

export const NUI_CHANNEL = NUI.channelBuilder()
  .emitsTo(CLIENT, async (message) => {
    const response = await fetch(
      `https://${GetParentResourceName()}/__MonorepoNetworker_nuiToClientRpc`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify(message),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (message.type === "emit") return undefined;
    const reply: MonorepoMessage = await response.json();
    if (reply.type === "error_response") throw new NetworkError(reply);
    return reply.payload[0];
  })
  .listensTo(CLIENT, (next) => {
    const listener = (event: MessageEvent<MonorepoMessage>) => {
      next(event.data);
    };

    window.addEventListener("message", listener);

    return () => {
      window.removeEventListener("message", listener);
    };
  })
  .begin();

// ----------- Message Handlers
