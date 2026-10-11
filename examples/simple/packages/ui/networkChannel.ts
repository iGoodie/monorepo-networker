import type { MonorepoMessage } from "../../../../src";
import { CLIENT, SERVER, UI } from "../../common/networkSides";
import { createHttpEmitter } from "../../common/httpEmitter";

const clientFrame = document.querySelector<HTMLIFrameElement>("#client-frame")!;

export const UI_CHANNEL = UI.channelBuilder()
  .emitsTo(CLIENT, (message) => {
    clientFrame.contentWindow!.postMessage(message, "*");
  })
  .emitsTo(SERVER, createHttpEmitter("http://localhost:3000"))
  .listensTo(CLIENT, (next) => {
    const listener = (event: MessageEvent<MonorepoMessage>) => {
      if (event.source !== clientFrame.contentWindow) return;
      next(event.data);
    };

    window.addEventListener("message", listener);

    return () => {
      window.removeEventListener("message", listener);
    };
  })
  .begin();
