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

  const CLIENT_CHANNEL = CLIENT.channelBuilder()
    .emitsTo(JS_SERVER, (message) => {
      deliverToJsServer(message, receiveJsServer, jsServerMessages);
    })
    .emitsTo(RS_SERVER, rustEmitter)
    .listensTo(JS_SERVER, (next) => {
      receiveClient = next;
      return () => {};
    })
    .begin();

  const JS_SERVER_CHANNEL = JS_SERVER.channelBuilder()
    .emitsTo(CLIENT, (message) => {
      deliverToJsServer(message, receiveClient, clientMessages);
    })
    .listensTo(CLIENT, (next) => {
      receiveJsServer = next;
      return () => {};
    })
    .begin();

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

describe("NetworkChannelBuilder", () => {
  it("starts a shared listener at begin and accepts emits from multiple sides", () => {
    const scenario = createScenario();
    let receive!: (message: MonorepoMessage) => void;
    const transport = vi.fn((next: (message: MonorepoMessage) => void) => {
      receive = next;
      return () => {};
    });
    const builder = scenario.CLIENT.channelBuilder();

    expect(builder.listens(transport)).toBe(builder);
    expect(transport).not.toHaveBeenCalled();
    const channel = builder.begin();
    const listener = vi.fn(() => undefined);
    channel.subscribeListener("showNotification", listener);

    expect(transport).toHaveBeenCalledTimes(1);
    for (const side of [scenario.JS_SERVER, scenario.RS_SERVER]) {
      const message: MonorepoMessage = {
        messageId: `shared-${side.name}`,
        type: "emit",
        from: side.name,
        eventName: "showNotification",
        payload: [side.name],
      };
      receive(message);
      expect(listener).toHaveBeenLastCalledWith(side.name, message);
    }
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("dispatches shared-transport requests and responds to their source sides", () => {
    const scenario = createScenario();
    let receive!: (message: MonorepoMessage) => void;
    const jsResponse = vi.fn();
    const rustResponse = vi.fn();
    const channel = scenario.CLIENT.channelBuilder()
      .emitsTo(scenario.JS_SERVER, jsResponse)
      .emitsTo(scenario.RS_SERVER, rustResponse)
      .listens((next) => {
        receive = next;
        return () => {};
      })
      .begin();
    channel.registerRequestHandler("reportMemoryUsage", () => 9999);

    for (const [side, response] of [
      [scenario.JS_SERVER, jsResponse],
      [scenario.RS_SERVER, rustResponse],
    ] as const) {
      const message: MonorepoMessage = {
        messageId: `shared-request-${side.name}`,
        type: "request",
        from: side.name,
        eventName: "reportMemoryUsage",
        payload: [],
      };
      receive(message);
      expect(response).toHaveBeenCalledTimes(1);
      expect(response).toHaveBeenCalledWith({
        ...message,
        type: "success_response",
        from: scenario.CLIENT.name,
        payload: [9999],
      });
    }
  });

  it("warns and ignores shared-transport requests from unknown sides", () => {
    const scenario = createScenario();
    let receive!: (message: MonorepoMessage) => void;
    const channel = scenario.CLIENT.channelBuilder()
      .listens((next) => {
        receive = next;
        return () => {};
      })
      .begin();
    const handler = vi.fn(() => 9999);
    channel.registerRequestHandler("reportMemoryUsage", handler);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      expect(() =>
        receive({
          messageId: "unknown-shared-request",
          type: "request",
          from: "unregistered-side",
          eventName: "reportMemoryUsage",
          payload: [],
        }),
      ).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith(
        "Received request from unknown side: unregistered-side",
      );
    } finally {
      warning.mockRestore();
    }
  });

  it("starts all network listeners only when begin is called", () => {
    const CLIENT = Networker.createSide(
      `builder-client-${++scenarioId}`,
    ).whichListens<{ showNotification: (message: string) => void }>();
    const firstListener = vi.fn(() => () => {});
    const secondListener = vi.fn(() => () => {});
    const builder = CLIENT.channelBuilder();

    expect(builder.listensTo(CLIENT, firstListener)).toBe(builder);
    expect(builder.listensTo(CLIENT, secondListener)).toBe(builder);
    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).not.toHaveBeenCalled();

    const channel = builder.begin();

    expect(channel).toBeInstanceOf(NetworkChannel);
    expect(channel.hostSide).toBe(CLIENT);
    expect(firstListener).toHaveBeenCalledTimes(1);
    expect(secondListener).toHaveBeenCalledTimes(1);
    expect(firstListener).toHaveBeenCalledWith(expect.any(Function));
    expect(secondListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it("keeps existing channels isolated from later emitter changes", () => {
    const scenario = createScenario();
    const firstEmitter = vi.fn();
    const secondEmitter = vi.fn();
    const builder = scenario.CLIENT.channelBuilder();

    expect(builder.emitsTo(scenario.JS_SERVER, firstEmitter)).toBe(builder);
    const firstChannel = builder.begin();
    builder.emitsTo(scenario.JS_SERVER, secondEmitter);
    const secondChannel = builder.begin();

    firstChannel.emit(scenario.JS_SERVER, "getServerTime");
    secondChannel.emit(scenario.JS_SERVER, "getServerTime");

    expect(firstEmitter).toHaveBeenCalledTimes(1);
    expect(secondEmitter).toHaveBeenCalledTimes(1);
  });

  it("routes each listener only from its configured side", () => {
    const scenario = createScenario();
    const receivers: ((message: MonorepoMessage) => void)[] = [];
    const builder = scenario.CLIENT.channelBuilder();
    for (const targetSide of [scenario.JS_SERVER, scenario.RS_SERVER]) {
      builder.listensTo(targetSide, (next) => {
        receivers.push(next);
        return () => {};
      });
    }
    const channel = builder.begin();
    const listener = vi.fn(() => undefined);
    channel.subscribeListener("showNotification", listener);
    const message: MonorepoMessage = {
      messageId: "side-filter-test",
      type: "emit",
      from: scenario.JS_SERVER.name,
      eventName: "showNotification",
      payload: ["hello"],
    };

    receivers[1](message);
    expect(listener).not.toHaveBeenCalled();
    receivers[0](message);
    receivers[0]({ ...message, from: scenario.RS_SERVER.name });
    receivers[1]({ ...message, from: scenario.RS_SERVER.name });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, "hello", message);
    expect(listener).toHaveBeenNthCalledWith(2, "hello", {
      ...message,
      from: scenario.RS_SERVER.name,
    });
  });

  it("preserves source filtering when constructing a channel directly", () => {
    const scenario = createScenario();
    let receive!: (message: MonorepoMessage) => void;
    const channel = new NetworkChannel(scenario.CLIENT, new Map(), [
      {
        targetSide: scenario.JS_SERVER,
        listener: (next) => {
          receive = next;
          return () => {};
        },
      },
    ]);
    const listener = vi.fn(() => undefined);
    channel.subscribeListener("showNotification", listener);
    const message: MonorepoMessage = {
      messageId: "direct-side-filter-test",
      type: "emit",
      from: scenario.RS_SERVER.name,
      eventName: "showNotification",
      payload: ["hello"],
    };

    receive(message);
    expect(listener).not.toHaveBeenCalled();
    receive({ ...message, from: scenario.JS_SERVER.name });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

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
