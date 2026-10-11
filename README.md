<!-- Logo -->
<p align="center">
  <picture>
    <source 
      media="(prefers-color-scheme: dark)" 
      height="150px"
      srcset="https://raw.githubusercontent.com/iGoodie/monorepo-networker/master/.github/assets/light-logo.svg" />
    <img 
      src   ="https://raw.githubusercontent.com/iGoodie/monorepo-networker/master/.github/assets/dark-logo.svg" 
      height="150px"
      alt   =""/>
  </picture>
</p>

<!-- Slogan -->
<p align="center">
  A library designed to facilitate the maintenance of networking code in monorepos
</p>

<!-- Badges -->
<p align="center">

  <!-- Github Badges -->
  <img src="https://raw.githubusercontent.com/TheSpawnProject/TheSpawnLanguage/master/.github/assets/github-badge.png" height="20px"/>
  <a href="https://github.com/iGoodie/monorepo-networker/commits/master">
    <img src="https://img.shields.io/github/last-commit/iGoodie/monorepo-networker"/>
  </a>
  <a href="https://github.com/iGoodie/monorepo-networker/issues">
    <img src="https://img.shields.io/github/issues/iGoodie/monorepo-networker"/>
  </a>

  <br/>

  <!-- Support Badges -->
  <img src="https://raw.githubusercontent.com/TheSpawnProject/TheSpawnLanguage/master/.github/assets/support-badge.png" height="20px"/>
  <a href="https://www.patreon.com/iGoodie">
    <img src="https://img.shields.io/endpoint.svg?url=https%3A%2F%2Fshieldsio-patreon.vercel.app%2Fapi%3Fusername%3DiGoodie%26type%3Dpatrons"/>
  </a>
</p>

# 🧶 What is monorepo-networker?

Consider a scenario where you maintain a codebase following the monorepo pattern, with an IPC-esque communication mechanism between sides—similar to [FiveM's Scripting SDK](https://www.figma.com/plugin-docs/) or [Figma's Plugin API](https://docs.fivem.net/docs/scripting-reference/). In such cases, you may encounter excessive boilerplate code just to ensure that the correct data is sent under the appropriate title. This library aims to simplify that process by abstracting transport strategies between sides, thereby standardizing communication.

# 🎁 Examples

- [Simple Example](https://github.com/iGoodie/monorepo-networker/tree/master/examples/simple): with 3 mockup sides: midware "Client", HTTP "Server" and React "UI"
- [Figma Plugin Example](https://github.com/iGoodie/monorepo-networker/tree/master/examples/figma-plugin): with 2 sides: figma "Plugin", and the renderer "UI"
- [FiveM Server Example](https://github.com/iGoodie/monorepo-networker/tree/master/examples/fivem-script): with 3 sides: resource "Server", resource "Client", and the "NUI"

The examples are reading material, not runnable applications. Their host APIs,
HTML, and runtime setup are intentionally not scaffolded. All example code is
checked with TypeScript; FiveM client, server, and NUI use separate host typings.

## Development

Use Node.js 22.12+ or 24+ and pnpm. Install from the repository root:

```sh
pnpm install
pnpm check
```

`pnpm check` typechecks the library, tests, Vite configuration, and every example;
runs the channel tests; and builds the library with Vite 8.
Use `pnpm typecheck:examples` to check only the example projects.
All workspace dependencies are recorded in the root lockfile.

# 💻 How to use it?

<!--

Before using it, keep in mind instances you create are supposed to be used commonly accross the sides. So we recommend storing those calls in a `/common/network` folder for convenience. -->

This library assumes your codebase is a monorepo that has distinct sides sharing some code. For simplicity, tutorial ahead will use a folder structure like so:

```
.
├── common/
└── packages/
    ├── ui/
    ├── client/
    └── server/
```

## 1. Define the Sides

Start by creating sides and defining the events they can receive.

```ts
// ./common/networkSides.ts

import { Networker } from "monorepo-networker";

export const UI = Networker.createSide("UI-side").whichListens<{
  focusOnSelected(): void;
  focusOnElement(elementId: string): void;
}>();

export const CLIENT = Networker.createSide("Client-side").whichListens<{
  hello(text: string): void;
  getClientTime(): number;
  createRectangle(width: number, height: number): void;
  execute(script: string): void;
}>();

export const SERVER = Networker.createSide("Server-side").whichListens<{
  hello(text: string): void;
  getServerTime(): number;
  fetchUser(userId: string): { id: string; name: string };
  markPresence(online: boolean): void;
}>();
```

> [!CAUTION]
> Side objects created here are supposed to be used across different side runtimes.
> Make sure **NOT** to use anything side-dependent in here.

## 2. Create the Channels

Create the channels for each side. Channels are responsible of communicating with other sides and listening to incoming messages using the registered strategies.

(Only the channel setup code for CLIENT side is shown, for simplicity.)

```ts
// ./packages/client/networkChannel.ts

import { NetworkError } from "monorepo-networker";
import type { MonorepoMessage } from "monorepo-networker";
import { CLIENT, SERVER, UI } from "@common/networkSides";

export const CLIENT_CHANNEL = CLIENT.channelBuilder()
  .emitsTo(UI, (message) => {
    // We're declaring how CLIENT sends a message to UI
    // In this example, we're sending the message to the UI via the parent window.
    parent.postMessage({ pluginMessage: message }, "*");
  })
  .emitsTo(SERVER, async (message) => {
    // We're declaring how CLIENT sends a message to SERVER
    // In this example, we're sending the message to the SERVER via an HTTP request.
    const response = await fetch("http://localhost:3000", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.status === 204) return undefined;
    const reply: MonorepoMessage = await response.json();
    if (reply.type === "error_response") throw new NetworkError(reply);
    return reply.payload[0];
  })
  .listensTo(UI, (next) => {
    // We're declaring how CLIENT receives a message from UI
    // In this example, we're listening to messages from the parent window.
    const listener = (event: MessageEvent) => {
      if (event.data?.pluginId == null) return;
      next(event.data.pluginMessage);
    };

    window.addEventListener("message", listener);

    return () => {
      window.removeEventListener("message", listener);
    };
  })
  .begin();

// ----------- Declare how an incoming message is handled

CLIENT_CHANNEL.registerRequestHandler("getClientTime", () => {
  // Returned value will be sent back to the requester
  return Date.now();
});
CLIENT_CHANNEL.registerRequestHandler("hello", (text, message) => {
  // Returning nothing will still send an acknowledgment back to the requester
  console.log(message.from, "said:", text);
});
CLIENT_CHANNEL.registerRequestHandler(
  "createRectangle",
  // Supports asynchronous handling
  async (width, height) => {
    return await drawRectangleAsync(width, height);
  },
);
CLIENT_CHANNEL.registerRequestHandler("execute", (script) => {
  console.log("Received script:", script);

  // Supports asynchronous handling
  return new Promise<void>((resolve) => {
    setTimeout(() => resolve(eval(script)), 5000);
  });
});
```

`listensTo(side, listener)` filters by `message.from`. Use `listens(listener)`
for a transport shared by several sides. These register transport callbacks;

Emitters returning `undefined`/`void` use protocol responses delivered through `next`.
Returning a value or a promise resolves a request directly, which is useful for
HTTP or non-JS bridges. For requests sent through a JS message transport, the
channel sends `success_response`, `error_response`, or `ack_response`, preserving
the request's `messageId`. With no request handler, acknowledgement is automatic;
it does not wait for asynchronous work started by an event listener.

`registerRequestHandler` allows you to define how incoming requests are handled and what responses are sent back to the requester.

## 3. Initialize & Invoke

Initialize each side in their entry point. And enjoy the standardized messaging api!

- `Channel::emit` will emit given event to the given side
- `Channel::request` will emit given event to the given side, and wait for a response from the target side.
- `Channel::subscribeListener` subscribes to typed events and returns an unsubscribe function.
- `Channel::subscribeAllListener` receives all incoming emits and requests, including their message metadata.

```ts
// ./packages/server/main.ts

import { Networker } from "monorepo-networker";
import { SERVER, CLIENT } from "@common/networkSides";
import { SERVER_CHANNEL } from "@server/networkChannel";

async function bootstrap() {
  Networker.initialize(SERVER);

  console.log("We are at", Networker.getCurrentSide().name);

  // ... Omitted code that bootstraps the server

  SERVER_CHANNEL.emit(CLIENT, "hello", "Hi there, client!");

  // Event though CLIENT's `createRectangle` returns void, we can still await on its acknowledgement.
  await SERVER_CHANNEL.request(CLIENT, "createRectangle", 100, 200);
}

bootstrap();
```

```tsx
// ./packages/client/main.ts

import { Networker, NetworkError } from "monorepo-networker";
import { CLIENT, SERVER } from "@common/networkSides";
import { CLIENT_CHANNEL } from "@client/networkChannel";
import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";

Networker.initialize(CLIENT);

console.log("We are @", Networker.getCurrentSide().name);

CLIENT_CHANNEL.emit(SERVER, "hello", "Hi there, server!");

// This one corresponds to SERVER's `getServerTime(): number;` event
CLIENT_CHANNEL.request(SERVER, "getServerTime")
  .then((serverTime) => {
    console.log('Server responded with "' + serverTime + '" !');
  })
  .catch((err) => {
    if (err instanceof NetworkError) {
      console.log("Server failed to respond..", { message: err.message });
    }
  });

const rootElement = document.getElementById("root") as HTMLElement;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

function App() {
  const rectangles = useRef<{ w: number; h: number }[]>([]);

  useEffect(() => {
    const unsubscribe = CLIENT_CHANNEL.subscribeListener(
      "createRectangle",
      (width, height, message) => {
        console.log(message.from, "asked for a rectangle!");
        rectangles.current.push({ w: width, h: height });
      },
    );

    return () => unsubscribe();
  }, []);

  return <main>{/* ... Omitted for simplicity */}</main>;
}
```

# ⭐ Special Thanks to

- [@thediaval](https://github.com/thediaval): For his endless support and awesome memes.

# 📜 License

&copy; 2024 Taha Anılcan Metinyurt (iGoodie)

For any part of this work for which the license is applicable, this work is licensed under the [Attribution-ShareAlike 4.0 International](http://creativecommons.org/licenses/by-sa/4.0/) license. (See LICENSE).

<a rel="license" href="http://creativecommons.org/licenses/by-sa/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by-sa/4.0/88x31.png" /></a>
