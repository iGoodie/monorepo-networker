import { NetworkError } from "./util/NetworkError";
import { OmitVoidReturns } from "./util/typeUtils";
import { uuidV4 } from "./util/uuid_v4";
import { Networker } from "./networker";
import { NetworkSide } from "./side";
import { MonorepoMessage, NetworkEvents } from "./types";

export namespace NetworkChannel {
  export type NetworkListener = (
    next: (inboundMessage: MonorepoMessage) => void,
  ) => (() => void) | void;

  export type NetworkListenerRegistration = {
    targetSide?: NetworkSide<any, any>;
    listener: NetworkListener;
  };

  /**
   * - When returns `undefined` -> emitter meant the message is sent without an immediate response, MonorepoNetworker will handle it asynchronously.
   * - When returns a `Promise<T>` -> emitter meant it will handle the request asynchronously and the promise will resolve with the payload.
   * - When returns a value `T` -> emitter meant it has handled the request synchronously and returned the payload.
   */
  export type Emitter = (message: MonorepoMessage) => any;

  export type RequestHandler<
    TEvents extends NetworkEvents,
    TEvent extends keyof TEvents,
  > = (
    ...args: [
      ...eventArgs: Parameters<TEvents[TEvent]>,
      inboundMessage: MonorepoMessage,
    ]
  ) => ReturnType<TEvents[TEvent]> | Promise<ReturnType<TEvents[TEvent]>>;

  export type EventListenerCallback<
    TEvents extends NetworkEvents,
    TEvent extends keyof TEvents,
  > = (
    ...args: [
      ...eventArgs: Parameters<TEvents[TEvent]>,
      inboundMessage: MonorepoMessage,
    ]
  ) => undefined;

  export type ReceiveListener<
    TEvents extends NetworkEvents,
    TEvent extends keyof TEvents,
  > = {
    id: string;
    callback: EventListenerCallback<TEvents, TEvent>;
    opts?: { once?: boolean };
  };

  export type ReceiveAnyListener = {
    id: string;
    callback: (inboundMessage: MonorepoMessage) => void;
    opts?: { once?: boolean };
  };
}

export class NetworkChannel<TEvents extends NetworkEvents> {
  protected readonly receiveAllListeners: NetworkChannel.ReceiveAnyListener[] =
    [];

  protected readonly receiveListeners = new Map<
    keyof TEvents,
    NetworkChannel.ReceiveListener<TEvents, keyof TEvents>[]
  >();

  protected readonly requestPromises = new Map<
    keyof TEvents,
    { resolve: Function; reject: Function }
  >();

  protected readonly requestHandlers = new Map<
    keyof TEvents,
    NetworkChannel.RequestHandler<TEvents, keyof TEvents>
  >();

  protected cleanupCallbacks: (() => void)[] = [];

  constructor(
    public readonly hostSide: NetworkSide<any, TEvents>,
    protected readonly sideEmitters: Map<string, NetworkChannel.Emitter>,
    protected readonly networkListeners: NetworkChannel.NetworkListenerRegistration[],
  ) {
    this.beginNetworkListeners();
  }

  protected beginNetworkListeners() {
    for (const { targetSide, listener } of this.networkListeners) {
      const cleanup = listener((message: MonorepoMessage) => {
        if (targetSide == null || message.from === targetSide.name) {
          this.onMessageReceived(message);
        } else {
          console.warn(
            `Received message from unexpected side: ${message.from}. Expected: ${targetSide.name}`,
          );
        }
      });
      if (cleanup != null) {
        this.cleanupCallbacks.push(cleanup);
      }
    }
  }

  protected getEmitter(to: NetworkSide<any, any>) {
    const emitter = this.sideEmitters.get(to.name);

    if (emitter == null) {
      throw new Error(
        `No emitting strategy is declared from side ${this.hostSide.name} to side: ${to.name}
        Call SIDE.channelBuilder().emitsTo during the channel setup.`,
      );
    }

    return emitter;
  }

  public emit<
    TTargetName extends string,
    TTargetEvents extends NetworkEvents,
    K extends keyof TTargetEvents,
  >(
    targetSide: NetworkSide<TTargetName, TTargetEvents>,
    eventName: K,
    ...payload: Parameters<TTargetEvents[K]>
  ) {
    const emit = this.getEmitter(targetSide);

    const messageId = uuidV4();

    emit({
      messageId,
      type: "emit",
      from: this.hostSide.name,
      eventName: eventName.toString(),
      payload: payload,
    });
  }

  public async request<
    TTargetName extends string,
    TTargetEvents extends NetworkEvents,
    K extends keyof TTargetEvents,
  >(
    targetSide: NetworkSide<TTargetName, TTargetEvents>,
    eventName: K,
    ...payload: Parameters<TTargetEvents[K]>
  ) {
    const emit = this.getEmitter(targetSide);

    const messageId = uuidV4();

    return new Promise<ReturnType<TTargetEvents[K]>>((resolve, reject) => {
      const result = emit({
        messageId,
        type: "request",
        from: this.hostSide.name,
        eventName: eventName.toString(),
        payload: payload,
      });

      // Emitter returns a Promise, meaning it will explicitly handle the request asynchronously
      // Generally used for envs where target side is not JS
      // (E.g Tauri Rust backend <-> JS frontend)
      if (result instanceof Promise) {
        result.then(resolve).catch(reject);
        return;
      }

      // Emitter returns a value, meaning it has explicitly handled the request synchronously
      // Generally used for envs where target side is not JS
      // (E.g Tauri Rust backend <-> JS frontend)
      if (result !== undefined) {
        resolve(result);
        return;
      }

      // Emitter did not return a value or a Promise, meaning it will handle the request asynchronously via the pendingPromises map
      this.requestPromises.set(messageId, { resolve, reject });
    });
  }

  public registerRequestHandler<TEvent extends keyof OmitVoidReturns<TEvents>>(
    event: TEvent,
    callback: NetworkChannel.RequestHandler<TEvents, TEvent>,
  ) {
    if (this.requestHandlers.has(event)) {
      console.warn(
        `Overwriting existing request handler for event: ${event.toString()}`,
      );
    }
    this.requestHandlers.set(event, callback);
  }

  public subscribeListener<TEvent extends keyof TEvents>(
    event: TEvent,
    callback: NetworkChannel.ReceiveListener<TEvents, TEvent>["callback"],
    opts?: NetworkChannel.ReceiveListener<TEvents, TEvent>["opts"],
  ) {
    const receiverId = uuidV4();

    if (!this.receiveListeners.has(event)) {
      this.receiveListeners.set(event, []);
    }

    const eventSubscribers = this.receiveListeners.get(event)!;

    eventSubscribers.push({ id: receiverId, callback, opts });

    return () => {
      const index = eventSubscribers.findIndex((sub) => sub.id === receiverId);
      if (index !== -1) {
        eventSubscribers.splice(index, 1);
      }
    };
  }

  public subscribeAllListener(
    callback: NetworkChannel.ReceiveAnyListener["callback"],
    opts?: NetworkChannel.ReceiveAnyListener["opts"],
  ) {
    const listenerId = uuidV4();

    this.receiveAllListeners.push({ id: listenerId, callback, opts });

    return () => {
      const index = this.receiveAllListeners.findIndex(
        (sub) => sub.id === listenerId,
      );
      if (index !== -1) {
        this.receiveAllListeners.splice(index, 1);
      }
    };
  }

  protected onMessageReceived(message: MonorepoMessage) {
    switch (message.type) {
      case "emit":
        this.onEmitReceived(message);
        break;
      case "request":
        this.onRequestReceived(message);
        break;
      case "success_response":
      case "error_response":
      case "ack_response":
        this.onResponseReceived(message);
        break;
      default:
        console.warn("Unknown message type received:", message.type);
    }
  }

  protected processEventListeners(message: MonorepoMessage) {
    for (const listener of [...this.receiveAllListeners]) {
      listener.callback(message);

      if (listener.opts?.once) {
        const index = this.receiveAllListeners.findIndex(
          (sub) => sub.id === listener.id,
        );
        if (index !== -1) {
          this.receiveAllListeners.splice(index, 1);
        }
      }
    }

    const eventListeners =
      this.receiveListeners.get(message.eventName as keyof TEvents) ?? [];

    for (const listener of [...eventListeners]) {
      listener.callback(
        ...(message.payload as Parameters<TEvents[keyof TEvents]>),
        message,
      );

      if (listener.opts?.once) {
        const index = eventListeners.findIndex((sub) => sub.id === listener.id);
        if (index !== -1) {
          eventListeners.splice(index, 1);
        }
      }
    }
  }

  protected onEmitReceived(message: MonorepoMessage) {
    this.processEventListeners(message);
  }

  protected onRequestReceived(message: MonorepoMessage) {
    const fromSide = Networker.getSideByName(message.from);

    if (fromSide == null) {
      console.warn(`Received request from unknown side: ${message.from}`);
      return;
    }

    this.processEventListeners(message);

    const emit = this.getEmitter(fromSide);

    const handler = this.requestHandlers.get(message.eventName);

    // If no handler is found for the request,
    // send an acknowledgment response back to the requester.
    if (handler == null) {
      return emit({
        messageId: message.messageId,
        type: "ack_response",
        eventName: message.eventName,
        from: this.hostSide.name,
        payload: [],
      });
    }

    const emitSuccess = (resolved: unknown) =>
      emit({
        messageId: message.messageId,
        type: "success_response",
        eventName: message.eventName,
        from: this.hostSide.name,
        payload: [resolved],
      });

    const emitError = (err: unknown) =>
      emit({
        messageId: message.messageId,
        type: "error_response",
        eventName: message.eventName,
        from: this.hostSide.name,
        payload: [err instanceof Error ? err.message : String(err)],
      });

    try {
      const handlerArgs = [...message.payload, message] as Parameters<
        typeof handler
      >;

      const responsePayload = handler(...handlerArgs);

      if (responsePayload instanceof Promise) {
        return responsePayload.then(
          (resolved) => emitSuccess(resolved),
          (err) => emitError(err),
        );
      }

      return emitSuccess(responsePayload);
    } catch (err) {
      return emitError(err);
    }
  }

  protected onResponseReceived(message: MonorepoMessage) {
    const pending = this.requestPromises.get(message.messageId);
    if (!pending) return;

    if (message.type === "success_response") {
      pending.resolve(message.payload[0]);
    } else if (message.type === "error_response") {
      pending.reject(new NetworkError(message));
    } else if (message.type === "ack_response") {
      pending.resolve(undefined);
    }

    this.requestPromises.delete(message.messageId);
  }

  public close() {
    for (const cleanup of this.cleanupCallbacks) {
      cleanup();
    }
    this.cleanupCallbacks = [];
  }
}

export class NetworkChannelBuilder<TEvents extends NetworkEvents> {
  protected readonly sideEmitters = new Map<string, NetworkChannel.Emitter>();
  protected readonly networkListeners: NetworkChannel.NetworkListenerRegistration[] =
    [];

  constructor(public readonly hostSide: NetworkSide<any, TEvents>) {}

  public emitsTo(
    targetSide: NetworkSide<any, any>,
    emitter: NetworkChannel.Emitter,
  ) {
    this.sideEmitters.set(targetSide.name, emitter);
    return this;
  }

  public listensTo(
    targetSide: NetworkSide<any, any>,
    listener: NetworkChannel.NetworkListener,
  ) {
    this.networkListeners.push({ targetSide, listener });
    return this;
  }

  public listens(listener: NetworkChannel.NetworkListener) {
    this.networkListeners.push({ listener });
    return this;
  }

  public begin(): NetworkChannel<TEvents> {
    return new NetworkChannel(this.hostSide, new Map(this.sideEmitters), [
      ...this.networkListeners,
    ]);
  }
}
