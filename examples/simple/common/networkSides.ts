import { Networker } from "../../../src";

export const UI = Networker.createSide("UI-side").whichListens<{
  focusOnSelected(): void;
  focusOnElement(elementId: string): void;
}>();

export const CLIENT = Networker.createSide("Client-side").whichListens<{
  getClientTime(): number;
  execute(script: string): void;
  receiveUser(user: { id: string; name: string }): void;
}>();

export const SERVER = Networker.createSide("Server-side").whichListens<{
  getServerTime(): number;
  fetchUser(userId: string): { id: string; name: string };
  markPresence(online: boolean): void;
}>();
