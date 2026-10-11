import { NetworkChannel } from "./channel";
import { NetworkEvents } from "./types";

export class NetworkSide<TName extends string, TEvents extends NetworkEvents> {
  constructor(public name: TName) {}

  channelBuilder() {
    return new NetworkChannel.Builder<TEvents>(this);
  }
}
