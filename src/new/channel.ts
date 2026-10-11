import { NetworkError } from "../util/NetworkError";
import { uuidV4 } from "../util/uuid_v4";
import { Networker } from "./networker";
import { NetworkSide } from "./side";
import { MonorepoMessage, NetworkEvents } from "./types";

export namespace NetworkChannel {
  export type Emitter = (msg: MonorepoMessage) => void;

  export type OmitVoidReturns<T extends NetworkEvents> = {
    [K in keyof T as T[K] extends (...args: any[]) => infer R
      ? R extends void
        ? never
        : K
      : K]: T[K];
  };

  export type RequestHandler<
    TEvents extends NetworkEvents,
    TEvent extends keyof TEvents,
  > = (
    ...args: [...Parameters<TEvents[TEvent]>, msg: MonorepoMessage]
  ) => ReturnType<TEvents[TEvent]>;

  export type EventListenerCallback<
    TEvents extends NetworkEvents,
    TEvent extends keyof TEvents,
  > = (...args: [...Parameters<TEvents[TEvent]>, msg: MonorepoMessage]) => void;

  export type ReceiveListener<
    TEvents extends NetworkEvents,
    TEvent extends keyof TEvents,
  > = {
    id: string;
    callback: EventListenerCallback<TEvents, TEvent>;
    opts?: {
      once?: boolean;
    };
  };
}

export class NetworkChannel<TEvents extends NetworkEvents> {
  protected readonly receiveListeners = new Map<
    keyof TEvents,
    NetworkChannel.ReceiveListener<TEvents, keyof TEvents>[]
  >();

  protected readonly pendingPromises = new Map<
    keyof TEvents,
    { resolve: Function; reject: Function }
  >();

  protected readonly requestHandlers = new Map<
    keyof TEvents,
    NetworkChannel.RequestHandler<TEvents, keyof TEvents>
  >();

  constructor(public readonly hostSide: NetworkSide<any, TEvents>) {}

  protected getEmitter(to: NetworkSide<any, any>) {
    // TODO:
    return null as unknown as NetworkChannel.Emitter;
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
      this.pendingPromises.set(messageId, { resolve, reject });

      emit({
        messageId,
        type: "request",
        from: this.hostSide.name,
        eventName: eventName.toString(),
        payload: payload,
      });
    });
  }

  public registerRequestHandler<
    TEvent extends keyof NetworkChannel.OmitVoidReturns<TEvents>,
  >(event: TEvent, callback: NetworkChannel.RequestHandler<TEvents, TEvent>) {
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
        this.onResponseReceived(message);
        break;
      default:
        console.warn("Unknown message type received:", message.type);
    }
  }

  protected processEventListeners(message: MonorepoMessage) {
    const receivers =
      this.receiveListeners.get(message.eventName as keyof TEvents) ?? [];

    for (const receiver of [...receivers]) {
      receiver.callback(
        ...(message.payload as Parameters<TEvents[keyof TEvents]>),
        message,
      );

      if (receiver.opts?.once) {
        const index = receivers.findIndex((sub) => sub.id === receiver.id);
        if (index !== -1) {
          receivers.splice(index, 1);
        }
      }
    }
  }

  protected onEmitReceived(message: MonorepoMessage) {
    this.processEventListeners(message);
  }

  protected onRequestReceived(message: MonorepoMessage) {
    this.processEventListeners(message);

    const handler = this.requestHandlers.get(message.eventName);

    // TODO: complete

    if (handler) {
      const responsePayload = handler(
        ...(message.payload as Parameters<typeof handler>),
      );
      // this.sendResponse(message, "success_response", [responsePayload]);
    } else {
      // this.sendResponse(message, "error_response", ["No handler found"]);
    }
  }

  protected onResponseReceived(message: MonorepoMessage) {
    const pending = this.pendingPromises.get(message.messageId);
    if (!pending) return;

    if (message.type === "success_response") {
      pending.resolve(message.payload[0]);
    } else if (message.type === "error_response") {
      pending.reject(new NetworkError(message));
    }

    this.pendingPromises.delete(message.messageId);
  }

  static Builder = class<TEvents extends NetworkEvents> {
    constructor(public readonly hostSide: NetworkSide<any, TEvents>) {}
  };
}

/* -- TEST --- */

const CLIENT = Networker.createSide("Client-side").whichListens<{
  showNotification: (message: string) => void;
  reportMemoryUsage: () => number;
}>();

const SERVER = Networker.createSide("Server-side").whichListens<{
  getServerTime: () => Date;
  registerAccount: (username: string, password: string) => boolean;
}>();

const CLIENT_CHANNEL = new NetworkChannel(CLIENT);

const unsub1 = CLIENT_CHANNEL.subscribeListener(
  "showNotification",
  (message, networkMessage) => {
    const fromSide = Networker.getSideByName(networkMessage.from)!;
    console.log("Notification:", message, "from", fromSide.name);
  },
);
const unsub2 = CLIENT_CHANNEL.subscribeListener("reportMemoryUsage", () => {
  return 999;
});

unsub1();
unsub2();

CLIENT_CHANNEL.emit(SERVER, "getServerTime");
CLIENT_CHANNEL.emit(SERVER, "registerAccount", "username", "password");

CLIENT_CHANNEL.registerRequestHandler("reportMemoryUsage", () => {
  return 9999;
});