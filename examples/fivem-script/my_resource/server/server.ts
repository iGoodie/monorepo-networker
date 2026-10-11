import { Networker } from "../../../../src";
import { CLIENT, SERVER } from "../common/networkSides";
import { createPlayerChannel, SERVER_CHANNEL } from "./server.network";

Networker.initialize(SERVER);

setTick(() => {
  getPlayers().forEach((playerId) => {
    const ped = GetPlayerPed(playerId);

    const position = GetEntityCoords(ped);

    createPlayerChannel(playerId).emit(
      CLIENT,
      "updatePlayerLocation",
      position[0],
      position[1],
    );
  });
});

createPlayerChannel(-1).emit(CLIENT, "updatePlayerLocation", 100, 200);

SERVER_CHANNEL.subscribeListener("createWaypoint", (x, y) => {
  console.log("Create waypoint", x, y);
});
