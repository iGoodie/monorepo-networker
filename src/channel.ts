import { Networker } from "./networker";
import { NetworkSide } from "./side";
import { NetworkEvents, NetworkMessage } from "./types";
import { NetworkError_OLD } from "./util/NetworkError";
import { uuidV4 } from "./util/uuid_v4";

const INTERNAL_SUCCESS_RESPONSE_EVENT = "__INTERNAL_SUCCESS_RESPONSE_EVENT";
const INTERNAL_ERROR_RESPONSE_EVENT = "__INTERNAL_ERROR_RESPONSE_EVENT";

type EmitStrategy<EM extends object> = (
  message: NetworkMessage,
  metadata: EM
) => void;

type ReceiveStrategy<EM> = (
  next: (
    message: NetworkMessage,
    ...[metadata]: [EM] extends [never] ? [] : [EM]
  ) => void
) => (() => void) | void;

type ResponseResolver = (value: any) => void;

type ResponseRejecter = (err: NetworkError_OLD) => void;

type MessageHandler<TEvents extends NetworkEvents, E extends keyof TEvents> = (
  ...args: [
    ...Parameters<TEvents[E]>,
    ...[from: NetworkSide<any, any>, rawMessage: NetworkMessage]
  ]
) => ReturnType<TEvents[E]> | Promise<ReturnType<TEvents[E]>>;

type SubscriptionListener<
  TEvents extends NetworkEvents,
  E extends keyof TEvents
> = (
  ...args: [
    ...Parameters<TEvents[E]>,
    ...[from: NetworkSide<any, any>, rawMessage: NetworkMessage]
  ]
) => undefined;

/**
 * Finalizes the Channel, and starts listening with given procedure.
 *
 * @param next Callback function that is supposed to be invoked with the message when an event is received.
 * @returns An optional cleanup function, that declares how this side detaches the attached listener(s).
 */
export type BeginListening = (
  next: (message: NetworkMessage, metadata?: any) => void
) => (() => void) | void;

export class NetworkChannelBuilder<
  TEvents extends NetworkEvents,
  TEmissionMeta extends { [SideName: string]: EmitStrategy<any> }
> {
  protected emitStrategies: Map<string, EmitStrategy<any>> = new Map();
  protected receiveStrategies: Map<string, ReceiveStrategy<any>> = new Map();

  constructor(protected readonly side: NetworkSide<any, TEvents>) {}

  /**
   * Register strategy for how this side receives messages from given other side.
   *
   *
   * @param side The network side from which messages will be received.
   * @param strategy The strategy for handling incoming messages from the specified side.
   * @returns This channel, so you can chain more things as needed
   */
  public receivesFrom<N extends string>(
    side: NetworkSide<N, any>,
    strategy: ReceiveStrategy<
      N extends keyof TEmissionMeta ? TEmissionMeta[N] : never
    >
  ) {
    this.receiveStrategies.set(side.name, strategy);
    return this;
  }

  /**
   * Register strategy on how this side emits message to given other side.
   *
   * @param to The target network side to which messages will be emitted.
   * @param strategy Strategy for emitting a message.
   * @returns This channel, so you can chain more things as needed
   */
  public emitsTo<N extends string, EM extends object = never>(
    side: NetworkSide<N, any>,
    strategy: EmitStrategy<EM>
  ) {
    this.emitStrategies.set(side.name, strategy);
    return this as unknown as NetworkChannelBuilder<
      TEvents,
      [EM] extends [never]
        ? TEmissionMeta
        : TEmissionMeta & {
            [K in N]: EM;
          }
    >;
  }

  /**
   * Finalizes and builds the Channel.
   * And starts listening with registered receiving strategies.
   *
   * @returns The channel
   */
  public startListening() {
    return new NetworkChannel<TEvents, TEmissionMeta>(
      this.side,
      this.emitStrategies,
      this.receiveStrategies
    );
  }
}

export class NetworkChannel<
  TEvents extends NetworkEvents,
  TEmissionMeta extends { [SideName: string]: EmitStrategy<any> }
> {
  protected messageHandlers: {
    [K in keyof TEvents]?: MessageHandler<TEvents, K>;
  } = {};
  protected subscriptionListeners: {
    [K in keyof TEvents]?: Record<string, SubscriptionListener<TEvents, K>>;
  } = {};
  protected pendingRequests: Map<
    string,
    { resolve: ResponseResolver; reject: ResponseRejecter }
  > = new Map();
  protected cleanupCallbacks: (() => void)[] = [];

  constructor(
    public readonly side: NetworkSide<any, TEvents>,
    protected emitStrategies: Map<string, EmitStrategy<any>> = new Map(),
    protected receiveStrategies: Map<string, ReceiveStrategy<any>> = new Map()
  ) {
    receiveStrategies.forEach((strategy) => {
      const next = (message: NetworkMessage, metadata?: any) =>
        this.receiveNetworkMessage(message, metadata);
      const cleanup = strategy(next);
      if (cleanup) this.cleanupCallbacks.push(cleanup);
    });
  }

  /**
   * Register a handler for an incoming message.
   * The handler is responsible of listening to incoming events, and possibly responding/returning a value to them.
   * @param eventName Name of the event to be listened
   * @param handler Handler that accepts incoming message and sender, then consumes them.
   */
  public registerMessageHandler<E extends keyof TEvents>(
    eventName: E,
    handler: MessageHandler<TEvents, E>
  ) {
    this.messageHandlers[eventName] = handler;
  }

  protected getEmitStrategy(side: NetworkSide<any, any>) {
    const strategy = this.emitStrategies.get(side.name);

    if (!strategy) {
      const currentSide = Networker.getCurrentSide();
      throw new Error(
        `No emit strategy is registered from ${currentSide.name} to ${side.name}`
      );
    }

    return strategy;
  }

  protected async receiveNetworkMessage(
    message: NetworkMessage,
    metadata: any
  ) {
    if (message.eventName === INTERNAL_SUCCESS_RESPONSE_EVENT) {
      this.receiveSuccessResponse(message);
      return;
    }

    if (message.eventName === INTERNAL_ERROR_RESPONSE_EVENT) {
      this.receiveErrorResponse(message);
      return;
    }

    this.invokeSubscribers(message);
    this.handleIncomingMessage(message, metadata);
  }

  protected async receiveSuccessResponse(message: NetworkMessage) {
    const { resolve } = this.pendingRequests.get(message.messageId) ?? {};
    if (resolve) {
      this.pendingRequests.delete(message.messageId);
      resolve(message.payload[0]);
    }
  }

  protected async receiveErrorResponse(message: NetworkMessage) {
    const { reject } = this.pendingRequests.get(message.messageId) ?? {};
    if (reject) {
      this.pendingRequests.delete(message.messageId);
      reject(new NetworkError_OLD(message));
    }
  }

  protected async invokeSubscribers(message: NetworkMessage) {
    Object.values(this.subscriptionListeners[message.eventName] ?? {}).forEach(
      (listener) => {
        listener(
          ...(message.payload as never),
          Networker.getSide(message.fromSide),
          message
        );
      }
    );
  }

  protected async handleIncomingMessage(
    message: NetworkMessage,
    metadata: any
  ) {
    const handler = this.messageHandlers[message.eventName];

    if (handler != null) {
      const side = Networker.getSide(message.fromSide);
      if (!side) {
        throw new Error(
          `Message received from an unknown side: ${message.fromSide}`
        );
      }

      const emit = this.getEmitStrategy(side);

      try {
        const result = await handler(
          ...(message.payload as never),
          Networker.getSide(message.fromSide),
          message
        );

        if (emit != null) {
          emit(
            {
              messageId: message.messageId,
              fromSide: message.fromSide,
              eventName: INTERNAL_SUCCESS_RESPONSE_EVENT,
              payload: [result],
            },
            metadata
          );
        }
      } catch (err) {
        if (emit != null) {
          emit(
            {
              messageId: message.messageId,
              fromSide: message.fromSide,
              eventName: INTERNAL_ERROR_RESPONSE_EVENT,
              payload: [
                err instanceof Error ? err.message : "Failed to handle",
              ],
            },
            metadata
          );
        }
      }
    }
  }

  /**
   * Emits an event to a target side of the network with the specified event name and arguments.
   *
   * @param targetSide - The side of the network to which the event will be emitted.
   * @param eventName - The name of the event to emit.
   * @param emitArgs - The arguments for the event handler corresponding to the `eventName`.
   * @param emitMetadata - The metadata for the event emitter to use.
   *
   * @example
   *  // ./common/sides.ts
   *  const OTHER_SIDE = Networker.createSide("Other-side").listens<
   *    hello(arg1: string): void;
   *  >();
   *
   *  MY_CHANNEL.emit(OTHER_SIDE, "hello", ["world"]);
   */
  public emit<N extends string, T extends NetworkEvents, E extends keyof T>(
    targetSide: NetworkSide<N, T>,
    eventName: E,
    emitArgs: Parameters<T[E]>,
    ...[emitMetadata]: N extends keyof TEmissionMeta ? [TEmissionMeta[N]] : []
  ) {
    const emit = this.getEmitStrategy(targetSide);

    emit(
      {
        messageId: uuidV4(),
        fromSide: Networker.getCurrentSide().name,
        eventName: eventName.toString(),
        payload: emitArgs,
      },
      emitMetadata
    );
  }

  /**
   * Sends a request to a target side of the network with the specified event name and arguments.
   * Returns a promise that resolves with the response from the target side.
   *
   * @param targetSide - The side of the network to which the request will be sent.
   * @param eventName - The name of the event to request.
   * @param eventArgs - The arguments for the event handler corresponding to the `eventName`.
   * @param emitMetadata - The metadata for the event emitter to use.
   *
   * @returns A promise that resolves with the return value of the event handler on the target side.
   *
   * @example
   *  // ./common/sides.ts
   *  const OTHER_SIDE = Networker.createSide("Other-side").listens<
   *    hello(arg1: string): void;
   *    updateItem(itemId: string, name: string): boolean;
   *  >();
   *
   *  MY_CHANNEL.request(OTHER_SIDE, "hello", ["world"]).then(() => {
   *    console.log("Other side received my request");
   *  });
   *  MY_CHANNEL.request(OTHER_SIDE, "updateItem", ["item-1", "My Item"]).then((success) => {
   *    console.log("Update success:", success);
   *  });
   */
  public async request<
    N extends string,
    T extends NetworkEvents,
    E extends keyof T
  >(
    targetSide: NetworkSide<any, T>,
    eventName: E,
    eventArgs: Parameters<T[E]>,
    ...[emitMetadata]: N extends keyof TEmissionMeta ? [TEmissionMeta[N]] : []
  ) {
    const emit = this.getEmitStrategy(targetSide);

    const messageId = uuidV4();

    return new Promise<ReturnType<T[E]>>((resolve, reject) => {
      this.pendingRequests.set(messageId, { resolve, reject });

      emit(
        {
          messageId,
          fromSide: Networker.getCurrentSide().name,
          eventName: eventName.toString(),
          payload: eventArgs,
        },
        emitMetadata
      );
    });
  }

  /**
   * Subscribes to an event with the specified event name and listener.
   * Returns an unsubscribe function to remove the listener.
   *
   * @param eventName - The name of the event to subscribe to.
   * @param eventListener - The listener function to handle the event when it is triggered.
   *
   * @returns A function to unsubscribe the listener from the event.
   *
   * @example
   *  // ./common/sides.ts
   *  const MY_SIDE = Networker.createSide("Other-side").listens<
   *    print(text: string): void;
   *  >();
   *
   * // ./my-side/network.ts
   *  const MY_CHANNEL = MY_SIDE.channelBuilder().beginListening();
   *
   *  const unsubscribe = MY_CHANNEL.subscribe("print", text => {
   *    console.log(text);
   *  });
   *  setTimeout(() => unsubscribe(), 5000);
   */
  public subscribe<E extends keyof TEvents>(
    eventName: E,
    eventListener: SubscriptionListener<TEvents, E>
  ) {
    const subId = uuidV4();

    const listeners = (this.subscriptionListeners[eventName] ??= {});
    listeners[subId] = eventListener;

    return () => {
      delete this.subscriptionListeners[eventName]![subId];
    };
  }
}
