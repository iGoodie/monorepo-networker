import type { MonorepoMessage } from "../../../../src";
import { CLIENT, NUI, SERVER } from "../common/networkSides";

const nuiCallbacks = new Map<string, (reply: MonorepoMessage | {}) => void>();

export const CLIENT_CHANNEL = CLIENT.channelBuilder()
  .emitsTo(NUI, (message) => {
    const callback = nuiCallbacks.get(message.messageId);
    if (callback) {
      callback(message);
      nuiCallbacks.delete(message.messageId);
    } else {
      SendNuiMessage(JSON.stringify(message));
    }
  })
  .emitsTo(SERVER, (message) => {
    emitNet("__MonorepoNetworker_clientToServerIpc", message);
  })
  .listensTo(SERVER, (next) => {
    onNet("__MonorepoNetworker_serverToClientIpc", next);
  })
  .listensTo(NUI, (next) => {
    const receiveEventName = "__MonorepoNetworker_nuiToClientRpc";
    RegisterNuiCallbackType(receiveEventName);
    on(`__cfx_nui:${receiveEventName}`, (
      message: MonorepoMessage,
      callback: (reply: MonorepoMessage | {}) => void,
    ) => {
      nuiCallbacks.set(message.messageId, callback);
      next(message);
      if (message.type === "emit") {
        callback({});
        nuiCallbacks.delete(message.messageId);
      }
    });
  })
  .begin();

CLIENT_CHANNEL.subscribeListener("updatePlayerLocation", (x, y) => {
  CLIENT_CHANNEL.emit(NUI, "displayGpsWaypoint", x, y, "green");
});
