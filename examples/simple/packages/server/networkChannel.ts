import { CLIENT, SERVER, UI } from "../../common/networkSides";
import http, { ServerResponse } from "node:http";
import type { MonorepoMessage } from "../../../../src";
import { getHttpBody } from "./util/httpUtils";

const responses = new Map<string, ServerResponse>();

function emitResponse(message: MonorepoMessage) {
  const response = responses.get(message.messageId);
  if (!response) return;

  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(message));
  responses.delete(message.messageId);
}

export const SERVER_CHANNEL = SERVER.channelBuilder()
  .emitsTo(CLIENT, emitResponse)
  .emitsTo(UI, emitResponse)
  .listens((next) => {
    const server = http.createServer(async (req, res) => {
      try {
        const message = await getHttpBody(req);
        if (message.from !== CLIENT.name && message.from !== UI.name) {
          res.writeHead(400).end("Unknown side");
          return;
        }
        responses.set(message.messageId, res);
        next(message);
        if (message.type === "emit") {
          res.writeHead(204).end();
          responses.delete(message.messageId);
        }
      } catch {
        res.writeHead(400).end("Invalid request");
      }
    });

    server.listen(3000);

    return () => {
      server.close();
    };
  })
  .begin();

// ----------- Message Handlers

const users: Record<string, { id: string; name: string; present: boolean }> = {
  "USER-1": { id: "USER-1", name: "User 1", present: false },
  "USER-2": { id: "USER-2", name: "User 2", present: true },
};

SERVER_CHANNEL.registerRequestHandler(
  "fetchUser",
  (userId) => {
    const user = users[userId];

    return (
      user || {
        id: "USER-0",
        name: "Unknown User",
      }
    );
  }
);

SERVER_CHANNEL.registerRequestHandler("getServerTime", () => Date.now());

SERVER_CHANNEL.subscribeListener("markPresence", (online) => {
  users["USER-1"].present = online;
});
