import { NetworkMessage } from "../../../../src";
import { CLIENT, NUI } from "../common/networkSides";

export const CLIENT_CHANNEL = CLIENT.channelBuilder()
  .emitsTo(NUI, (message) => {
    SendNuiMessage(JSON.stringify(message));
  })
  .receivesFrom(NUI, (next) => {
    const receiveEventName = "__MonorepoNetworker_nuiToClientRpc";
    RegisterNuiCallbackType(receiveEventName);
    on(`__cfx_nui:${receiveEventName}`, (message: NetworkMessage) =>
      next(message),
    );
  })
  .startListening();
