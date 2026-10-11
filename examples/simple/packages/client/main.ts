import { Networker } from "../../../../src";
import { CLIENT, SERVER } from "../../common/networkSides";
import { CLIENT_CHANNEL } from "./networkChannel";

Networker.initialize(CLIENT);

console.log("We're at", Networker.getCurrentSide().name);

async function bootstrap() {
  CLIENT_CHANNEL.emit(SERVER, "markPresence", true);

  const user = await CLIENT_CHANNEL.request(SERVER, "fetchUser", "USER-1");
  console.log(user.id);
  console.log(user.name);

  const serverTime = await CLIENT_CHANNEL.request(SERVER, "getServerTime");
  console.log(serverTime);

  const unsub = CLIENT_CHANNEL.subscribeListener("execute", (script, message) => {
    console.log("Received script", script, "from", message.from);
  });

  setTimeout(() => unsub(), 5000);

  // Only sends
  CLIENT_CHANNEL.emit(SERVER, "markPresence", true);

  // Awaits for ack
  await CLIENT_CHANNEL.request(SERVER, "markPresence", true);

  CLIENT_CHANNEL.request(SERVER, "fetchUser", "USER-1").then((user) => {
    console.log("Responded with", user);
  });

  CLIENT_CHANNEL.subscribeListener("receiveUser", (user, message) => {
    console.log(`${message.from} sent us user info:`, user);
  });
}

bootstrap();
