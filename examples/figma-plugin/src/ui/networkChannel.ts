import { PLUGIN, UI } from "@common/networkSides";
import type { MonorepoMessage } from "../../../../src";

export const UI_CHANNEL = UI.channelBuilder()
  .emitsTo(PLUGIN, (message) => {
    parent.postMessage({ pluginMessage: message }, "*");
  })
  .listensTo(PLUGIN, (next) => {
    const listener = (event: MessageEvent<{ pluginId?: string; pluginMessage: MonorepoMessage }>) => {
      if (event.data?.pluginId == null) return;
      next(event.data.pluginMessage);
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  })
  .begin();

// ---------- Message handlers

UI_CHANNEL.subscribeListener("hello", (text, message) => {
  console.log(`${message.from} said "${text}"`);
});
