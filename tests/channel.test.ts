import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkChannel } from "../src/new/channel";
import { Networker } from "../src/new/networker";
import type { MonorepoMessage } from "../src/new/types";
import { NetworkError } from "../src/util/NetworkError";

type RustEmit = (name: string, args: any[]) => Promise<any>;

let scenarioId = 0;

afterEach(() => {
  vi.unstubAllGlobals();
});

function createScenario() {
  const id = ++scenarioId;

  const CLIENT = Networker.createSide(`Client-side-${id}`).whichListens<{
    showNotification: (message: string) => void;
    reportMemoryUsage: () => number;
  }>();

  const JS_SERVER = Networker.createSide(`Server.js-side-${id}`).whichListens<{
    getServerTime: () => Date;
    registerAccount: (username: string, password: string) => boolean;
  }>();

  const RS_SERVER = Networker.createSide(`Server.rs-side-${id}`).whichListens<{
    getServerTime: () => Date;
    registerAccount: (username: string, password: string) => boolean;
  }>();

  const clientMessages: MonorepoMessage[] = [];
  const jsServerMessages: MonorepoMessage[] = [];
  let receiveClient!: (message: MonorepoMessage) => void;
  let receiveJsServer!: (message: MonorepoMessage) => void;

  const rustEmit = vi
    .fn<Parameters<RustEmit>, ReturnType<RustEmit>>()
    .mockResolvedValue(undefined);
  vi.stubGlobal("emit", rustEmit);

  const rustEmitter = vi.fn((message: MonorepoMessage) => {
    const emit = (globalThis as typeof globalThis & { emit: RustEmit }).emit;
    return emit(message.eventName, message.payload);
  });

  function deliverToJsServer(
    message: MonorepoMessage,
    receive: (message: MonorepoMessage) => void,
    received: MonorepoMessage[],
  ) {
    const copy: MonorepoMessage = JSON.parse(JSON.stringify(message));
    queueMicrotask(() => {
      received.push(copy);
      receive(copy);
    });
  }

  // TODO: Replace with CLIENT.channelBuilder() when available
  const CLIENT_CHANNEL = new NetworkChannel(
    CLIENT,
    new Map<string, NetworkChannel.Emitter>([
      [
        JS_SERVER.name,
        (message) => {
          deliverToJsServer(message, receiveJsServer, jsServerMessages);
        },
      ],
      [RS_SERVER.name, rustEmitter],
    ]),
    [
      (next) => {
        receiveClient = next;
        return () => {};
      },
    ],
  );

  // TODO: Replace with JS_SERVER.channelBuilder() when available
  const JS_SERVER_CHANNEL = new NetworkChannel(
    JS_SERVER,
    new Map<string, NetworkChannel.Emitter>([
      [
        CLIENT.name,
        (message) => {
          deliverToJsServer(message, receiveClient, clientMessages);
        },
      ],
    ]),
    [
      (next) => {
        receiveJsServer = next;
        return () => {};
      },
    ],
  );

  return {
    CLIENT,
    JS_SERVER,
    RS_SERVER,
    CLIENT_CHANNEL,
    JS_SERVER_CHANNEL,
    clientMessages,
    jsServerMessages,
    rustEmit,
    rustEmitter,
  };
}

type Scenario = ReturnType<typeof createScenario>;

function expectJsRegisterAccountInvocation(
  scenario: Scenario,
  responseType: "success_response" | "error_response" | "ack_response",
  responsePayload: unknown[],
) {
  expect(scenario.jsServerMessages).toEqual([
    {
      messageId: expect.any(String),
      type: "request",
      from: scenario.CLIENT.name,
      eventName: "registerAccount",
      payload: ["username", "password"],
    },
  ]);
  expect(scenario.jsServerMessages[0].messageId).not.toBe("");
  expect(scenario.clientMessages).toEqual([
    {
      messageId: scenario.jsServerMessages[0].messageId,
      type: responseType,
      from: scenario.JS_SERVER.name,
      eventName: "registerAccount",
      payload: responsePayload,
    },
  ]);
  expect(scenario.rustEmit).not.toHaveBeenCalled();
}

function expectRustRegisterAccountInvocation(
  scenario: Scenario,
  type: "emit" | "request",
) {
  expect(scenario.rustEmitter).toHaveBeenCalledTimes(1);
  expect(scenario.rustEmitter).toHaveBeenCalledWith({
    messageId: expect.any(String),
    type,
    from: scenario.CLIENT.name,
    eventName: "registerAccount",
    payload: ["username", "password"],
  });
  expect(scenario.rustEmit).toHaveBeenCalledTimes(1);
  expect(scenario.rustEmit).toHaveBeenCalledWith("registerAccount", [
    "username",
    "password",
  ]);
  expect(scenario.jsServerMessages).toEqual([]);
  expect(scenario.clientMessages).toEqual([]);
}

describe("NetworkChannel.emit", () => {
  it("delivers an emit message to JS_SERVER through next without a response", async () => {
    const scenario = createScenario();
    const listener = vi.fn(() => undefined);
    scenario.JS_SERVER_CHANNEL.subscribeListener("registerAccount", listener);

    scenario.CLIENT_CHANNEL.emit(
      scenario.JS_SERVER,
      "registerAccount",
      "username",
      "password",
    );
    await Promise.resolve();

    expect(scenario.CLIENT_CHANNEL.hostSide).toBe(scenario.CLIENT);
    expect(scenario.jsServerMessages).toEqual([
      {
        messageId: expect.any(String),
        type: "emit",
        from: scenario.CLIENT.name,
        eventName: "registerAccount",
        payload: ["username", "password"],
      },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      "username",
      "password",
      scenario.jsServerMessages[0],
    );
    expect(scenario.clientMessages).toEqual([]);
    expect(scenario.rustEmit).not.toHaveBeenCalled();
  });

  it("invokes the global emit for RUST_SERVER without a JS message exchange", async () => {
    const scenario = createScenario();

    const result = scenario.CLIENT_CHANNEL.emit(
      scenario.RS_SERVER,
      "registerAccount",
      "username",
      "password",
    );
    await Promise.resolve();

    expect(result).toBeUndefined();
    expectRustRegisterAccountInvocation(scenario, "emit");
    expect(scenario.rustEmitter.mock.results[0].value).toBeInstanceOf(Promise);
    await expect(
      scenario.rustEmitter.mock.results[0].value,
    ).resolves.toBeUndefined();
  });
});

describe("NetworkChannel.subscribeListener", () => {
  it("filters CLIENT events and stops delivering after unsubscribe", async () => {
    const scenario = createScenario();
    const listener = vi.fn(() => undefined);
    const otherListener = vi.fn(() => undefined);
    const unsubscribe = scenario.CLIENT_CHANNEL.subscribeListener(
      "showNotification",
      listener,
    );
    scenario.CLIENT_CHANNEL.subscribeListener(
      "reportMemoryUsage",
      otherListener,
    );

    scenario.JS_SERVER_CHANNEL.emit(
      scenario.CLIENT,
      "showNotification",
      "first",
    );
    await Promise.resolve();
    unsubscribe();
    unsubscribe();
    scenario.JS_SERVER_CHANNEL.emit(
      scenario.CLIENT,
      "showNotification",
      "second",
    );
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("first", scenario.clientMessages[0]);
    expect(scenario.clientMessages[0]).toMatchObject({
      type: "emit",
      from: scenario.JS_SERVER.name,
      eventName: "showNotification",
      payload: ["first"],
    });
    expect(otherListener).not.toHaveBeenCalled();
  });

  it("delivers once listeners only once", async () => {
    const scenario = createScenario();
    const listener = vi.fn(() => undefined);
    scenario.CLIENT_CHANNEL.subscribeListener("showNotification", listener, {
      once: true,
    });

    scenario.JS_SERVER_CHANNEL.emit(
      scenario.CLIENT,
      "showNotification",
      "first",
    );
    scenario.JS_SERVER_CHANNEL.emit(
      scenario.CLIENT,
      "showNotification",
      "second",
    );
    await Promise.resolve();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith("first", scenario.clientMessages[0]);
  });
});

describe("NetworkChannel.request to JS_SERVER", () => {
  it("sends request and success_response messages with the same ID", async () => {
    const scenario = createScenario();
    const listener = vi.fn(() => undefined);
    scenario.JS_SERVER_CHANNEL.subscribeListener("registerAccount", listener);
    scenario.JS_SERVER_CHANNEL.registerRequestHandler(
      "registerAccount",
      () => true,
    );

    await expect(
      scenario.CLIENT_CHANNEL.request(
        scenario.JS_SERVER,
        "registerAccount",
        "username",
        "password",
      ),
    ).resolves.toBe(true);

    expectJsRegisterAccountInvocation(scenario, "success_response", [true]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      "username",
      "password",
      scenario.jsServerMessages[0],
    );
  }, 1000);

  it("sends error_response and rejects when the handler throws", async () => {
    const scenario = createScenario();
    scenario.JS_SERVER_CHANNEL.registerRequestHandler("registerAccount", () => {
      throw new Error("Cannot register account");
    });

    const request = scenario.CLIENT_CHANNEL.request(
      scenario.JS_SERVER,
      "registerAccount",
      "username",
      "password",
    );
    await expect(request).rejects.toBeInstanceOf(NetworkError);
    await expect(request).rejects.toThrow("Cannot register account");

    expectJsRegisterAccountInvocation(scenario, "error_response", [
      "Cannot register account",
    ]);
  }, 1000);

  it("sends ack_response when no request handler is registered", async () => {
    const scenario = createScenario();

    await expect(
      scenario.CLIENT_CHANNEL.request(
        scenario.JS_SERVER,
        "registerAccount",
        "username",
        "password",
      ),
    ).resolves.toBeUndefined();

    expectJsRegisterAccountInvocation(scenario, "ack_response", []);
  }, 1000);
});

describe("NetworkChannel.request to RUST_SERVER", () => {
  it("waits for the global emit promise without a protocol response", async () => {
    const scenario = createScenario();
    let resolveRust!: (value: boolean) => void;
    const rustResponse = new Promise<boolean>((resolve) => {
      resolveRust = resolve;
    });
    scenario.rustEmit.mockReturnValueOnce(rustResponse);

    const onResolved = vi.fn();
    const request = scenario.CLIENT_CHANNEL.request(
      scenario.RS_SERVER,
      "registerAccount",
      "username",
      "password",
    );
    const observed = request.then(onResolved);
    await Promise.resolve();

    expect(onResolved).not.toHaveBeenCalled();
    expect(scenario.rustEmitter.mock.results[0].value).toBeInstanceOf(Promise);
    resolveRust(true);
    await expect(request).resolves.toBe(true);
    await observed;

    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onResolved).toHaveBeenCalledWith(true);
    expectRustRegisterAccountInvocation(scenario, "request");
  }, 1000);

  it("propagates rejection from the global emit without an error_response", async () => {
    const scenario = createScenario();
    const error = new Error("Rust registration failed");
    scenario.rustEmit.mockRejectedValueOnce(error);

    await expect(
      scenario.CLIENT_CHANNEL.request(
        scenario.RS_SERVER,
        "registerAccount",
        "username",
        "password",
      ),
    ).rejects.toBe(error);

    expectRustRegisterAccountInvocation(scenario, "request");
  }, 1000);

  it("resolves an undefined promise result without waiting for ack_response", async () => {
    const scenario = createScenario();

    await expect(
      scenario.CLIENT_CHANNEL.request(
        scenario.RS_SERVER,
        "registerAccount",
        "username",
        "password",
      ),
    ).resolves.toBeUndefined();

    expectRustRegisterAccountInvocation(scenario, "request");
  }, 1000);
});
