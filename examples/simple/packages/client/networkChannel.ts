import type { MonorepoMessage } from "../../../../src";
import { CLIENT, SERVER, UI } from "../../common/networkSides";
import { createHttpEmitter } from "../../common/httpEmitter";

export const CLIENT_CHANNEL = CLIENT.channelBuilder()
  .emitsTo(UI, (message) => {
    parent.postMessage(message, "*");
  })
  .emitsTo(SERVER, createHttpEmitter("http://localhost:3000"))
  .listensTo(UI, (next) => {
    const listener = (event: MessageEvent<MonorepoMessage>) => {
      if (event.source !== parent) return;
      next(event.data);
    };

    window.addEventListener("message", listener);

    return () => {
      window.removeEventListener("message", listener);
    };
  })
  .begin();

// ----------- Message Handlers

CLIENT_CHANNEL.subscribeListener("execute", (script) => {
  eval(script);
});
CLIENT_CHANNEL.registerRequestHandler("getClientTime", () => {
  return Date.now();
});
CLIENT_CHANNEL.subscribeListener("receiveUser", (user) => {
  console.log("A user is received:", user);
});
