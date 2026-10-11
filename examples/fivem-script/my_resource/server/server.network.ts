import type { MonorepoMessage } from "../../../../src";
import { CLIENT, SERVER } from "../common/networkSides";

const requestPlayers = new Map<string, number>();

export function createPlayerChannel(playerId: string | number) {
  return SERVER.channelBuilder()
    .emitsTo(CLIENT, (message) => {
      emitNet("__MonorepoNetworker_serverToClientIpc", playerId, message);
    })
    .begin();
}

export const SERVER_CHANNEL = SERVER.channelBuilder()
  .emitsTo(CLIENT, (message) => {
    const playerId = requestPlayers.get(message.messageId);
    if (playerId == null) return;
    emitNet("__MonorepoNetworker_serverToClientIpc", playerId, message);
    requestPlayers.delete(message.messageId);
  })
  .listensTo(CLIENT, (next) => {
    onNet(
      "__MonorepoNetworker_clientToServerIpc",
      (message: MonorepoMessage) => {
        requestPlayers.set(message.messageId, global.source);
        next(message);
        if (message.type === "emit") requestPlayers.delete(message.messageId);
      }
    );
  })
  .begin();

// ----------- Message Handlers

SERVER_CHANNEL.registerRequestHandler("fetchPlayerLocation", () => {
  const [x, y] = GetEntityCoords(GetPlayerPed(String(global.source)));
  return [x, y];
});
