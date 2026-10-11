import { Networker } from "../../../../src";

export const PLUGIN = Networker.createSide("Plugin-side").whichListens<{
  createRectangle(width: number, height: number): string;
}>();

export const UI = Networker.createSide("UI-side").whichListens<{
  hello(text: string): void;
  focusOnElement(elementId: string): void;
}>();
