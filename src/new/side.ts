import { NetworkChannel } from "./channel";
import { NetworkEvents } from "./types";

export class NetworkSide<TName extends string, TEvents extends NetworkEvents> {
  constructor(public name: TName) {}

  channelBuilder(): NetworkChannel.Builder<TEvents> {
    return new NetworkChannel.Builder<TEvents>(this);
  }
}
