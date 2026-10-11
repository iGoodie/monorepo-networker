import { NetworkChannelBuilder } from "./channel";
import { NetworkEvents } from "./types";

export class NetworkSide<TName extends string, TEvents extends NetworkEvents> {
  constructor(public name: TName) {}

  channelBuilder(): NetworkChannelBuilder<TEvents> {
    return new NetworkChannelBuilder<TEvents>(this);
  }
}
