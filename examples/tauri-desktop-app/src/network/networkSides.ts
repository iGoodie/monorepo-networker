import { Networker } from "../../../../src";

export const FRONTEND = Networker.createSide("Frontend").whichListens<{
  notification(payload: { message: string }): void;
}>();

export const RUST = Networker.createSide("Rust").whichListens<{
  greet(payload: { name: string }): string;
  notify(): void;
}>();
