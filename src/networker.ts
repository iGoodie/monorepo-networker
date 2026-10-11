import { NetworkEvents } from "./types";
import { NetworkSide } from "./side";

export namespace Networker {
  const _sides: NetworkSide<any, any>[] = [];
  let _currentSide: NetworkSide<any, any> | undefined;

  /**
   * @throws Will throw an error, if this logical side is not initialized yet.
   * @returns Current logical side
   */
  export function getCurrentSide() {
    if (_currentSide == null) {
      throw new Error("Logical side is not initialized yet.");
    }
    return _currentSide;
  }

  /**
   * Initializes the side into given channel.
   *
   * **NOTE:** This MUST be called, before any emit/request can be called from the channel
   * @param side Side object created by `Networker.createSide`
   */
  export function initialize<N extends string, T extends NetworkEvents>(
    side: NetworkSide<N, T>,
  ) {
    if (_currentSide != null) {
      throw new Error("Logical side can be initialized only once.");
    }
    _currentSide = side;
  }

  /**
   * Creates a "side" representation that holds the events it can handle/listen.
   * @param name Display name of the side
   * @returns A lightweight/shareable representation of the logical side
   */
  export function createSide<N extends string>(name: N) {
    return {
      whichListens: <TEvents extends NetworkEvents>() => {
        const side = new NetworkSide<N, TEvents>(name);
        _sides.push(side);
        return side;
      },
    };
  }

  /**
   * Attempts to lookup the side, by its name.
   * @param name Name of the logical side
   * @returns Side with given name
   */
  export function getSideByName(name: string) {
    for (let side of _sides) {
      if (side.name === name) return side;
    }
    return null;
  }
}
