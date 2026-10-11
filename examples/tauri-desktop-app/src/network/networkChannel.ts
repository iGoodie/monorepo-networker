import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import { FRONTEND, RUST } from "./networkSides";

if (!isTauri()) {
  throw new Error(
    "Rust backend unavailable. Start the desktop app with pnpm tauri dev.",
  );
}

let onTransportError: (error: unknown) => void;

export async function initFrontendChannel(
  _onTransportError: (error: unknown) => void,
) {
  onTransportError = _onTransportError;
}

export const FRONTEND_CHANNEL = FRONTEND.channelBuilder()
  .emitsTo(RUST, (message) => {
    const result = invoke(message.eventName, message.payload);
    if (message.type === "request") return result;
    void result.catch(onTransportError);
  })
  .listensTo(RUST, (next) => {
    const receive = (event: Event<unknown>) => {
      next({
        messageId: crypto.randomUUID(),
        type: "emit",
        from: RUST.name,
        eventName: event.event,
        payload: [event.payload],
      });
    };

    const unlistenPromises = Promise.all([
      listen("greet", (event) => receive(event)),
      listen("notify", (event) => receive(event)),
    ]);

    return () => {
      unlistenPromises.then((unlistenFns) =>
        unlistenFns.forEach((unlisten) => unlisten()),
      );
    };
  })
  .begin();
