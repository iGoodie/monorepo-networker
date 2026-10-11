import { Networker } from "../../../../src";

export const NUI = Networker.createSide("NUI-side").whichListens<{
  displayGpsWaypoint(x: number, y: number, color: string): void;
}>();

export const CLIENT = Networker.createSide("Client-side").whichListens<{
  updatePlayerLocation(x: number, y: number): void;
}>();

export const SERVER = Networker.createSide("Server-side").whichListens<{
  fetchPlayerLocation(): [x: number, y: number];
  createWaypoint(x: number, y: number): void;
}>();
