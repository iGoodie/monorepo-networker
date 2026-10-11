import { NetworkChannel } from "../src/new/channel";
import { Networker } from "../src/new/networker";

/* -- TEST 1 --- */

const CLIENT = Networker.createSide("Client-side").whichListens<{
  showNotification: (message: string) => void;
  reportMemoryUsage: () => number;
}>();

const JS_SERVER = Networker.createSide("Server.js-side").whichListens<{
  getServerTime: () => Date;
  registerAccount: (username: string, password: string) => boolean;
}>();

const RUST_SERVER = Networker.createSide("Server.rs-side").whichListens<{
  getServerTime: () => Date;
  registerAccount: (username: string, password: string) => boolean;
}>();

/* -- TEST 2 --- */

CLIENT.channelBuilder(); // <-- TODO

const sideEmitters = new Map<string, NetworkChannel.Emitter>();

sideEmitters.set(JS_SERVER.name, (message) => {
  fetch("http://localhost:3000/", {
    method: "POST",
    body: JSON.stringify(message),
  });
});

declare const emit: (name: string, args: any[]) => Promise<void>;
sideEmitters.set(RUST_SERVER.name, async (message) => {
  return emit(message.eventName, message.payload);
});

const CLIENT_CHANNEL = new NetworkChannel(CLIENT, sideEmitters, []);

/* -- TEST 3 --- */

const unsub1 = CLIENT_CHANNEL.subscribeListener(
  "showNotification",
  (message, networkMessage) => {
    const fromSide = Networker.getSideByName(networkMessage.from)!;
    console.log("Notification:", message, "from", fromSide.name);
  },
);
const unsub2 = CLIENT_CHANNEL.subscribeListener("reportMemoryUsage", () => {
  console.log("Received");
});
const unsub3 = CLIENT_CHANNEL.subscribeAllListener((inboundMessage) => {
  console.log("Received", inboundMessage);
});

unsub1();
unsub2();
unsub3();

CLIENT_CHANNEL.emit(JS_SERVER, "getServerTime");
CLIENT_CHANNEL.emit(RUST_SERVER, "getServerTime");
CLIENT_CHANNEL.emit(JS_SERVER, "registerAccount", "username", "password");
CLIENT_CHANNEL.emit(RUST_SERVER, "registerAccount", "username", "password");

CLIENT_CHANNEL.request(JS_SERVER, "registerAccount", "username", "password")
  .then(console.log)
  .catch(console.error);

CLIENT_CHANNEL.request(RUST_SERVER, "registerAccount", "username", "password")
  .then(console.log)
  .catch(console.error);

CLIENT_CHANNEL.registerRequestHandler("reportMemoryUsage", () => {
  return 9999;
});