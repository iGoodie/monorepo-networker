import { Networker } from "../../../../src";
import { SERVER } from "../../common/networkSides";
import { SERVER_CHANNEL } from "./networkChannel";

Networker.initialize(SERVER);

console.log("We're at", Networker.getCurrentSide().name);

SERVER_CHANNEL.subscribeListener("fetchUser", (userId, message) => {
  console.log(`[LOG] ${message.from} requested fetchUser(${userId})`);
});
