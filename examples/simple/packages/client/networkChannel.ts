import { NetworkMessage } from "../../../../src";
import { CLIENT, SERVER, UI } from "../../common/networkSides";

const serverResBuffer: NetworkMessage[] = [];

export const CLIENT_CHANNEL = CLIENT.channelBuilder()
  .emitsTo(UI, (message) => {
    parent.postMessage({ pluginMessage: message }, "*");
  })
  .emitsTo(SERVER, (message) => {
    fetch("server://", { method: "POST", body: JSON.stringify(message) })
      .then((response) => response.json())
      .then((json) => serverResBuffer.push(json as NetworkMessage));
  })
  .receivesFrom(UI, (next) => {
    const listener = (event: MessageEvent) => {
      if (event.data?.pluginId == null) return;
      next(event.data.pluginMessage);
    };

    window.addEventListener("message", listener);

    return () => {
      window.removeEventListener("message", listener);
    };
  })
  .receivesFrom(SERVER, (next) => {
    const interval = setInterval(() => {
      if (serverResBuffer.length > 0) {
        next(serverResBuffer.shift()!);
      }
    }, 20);

    return () => {
      clearInterval(interval);
    };
  })
  .startListening();

// ----------- Message Handlers

CLIENT_CHANNEL.registerMessageHandler("execute", (script, from) => {
  eval(script);
});
CLIENT_CHANNEL.registerMessageHandler("getClientTime", () => {
  return Date.now();
});
CLIENT_CHANNEL.registerMessageHandler("receiveUser", (user) => {
  console.log("A user is received:", user);
});
