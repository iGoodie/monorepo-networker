import { PLUGIN, UI } from "@common/networkSides";

export const PLUGIN_CHANNEL = PLUGIN.channelBuilder()
  .emitsTo(UI, (message) => {
    figma.ui.postMessage(message);
  })
  .listensTo(UI, (next) => {
    const listener: MessageEventHandler = (event) => next(event);
    figma.ui.on("message", listener);
    return () => figma.ui.off("message", listener);
  })
  .begin();

// ---------- Message handlers

PLUGIN_CHANNEL.registerRequestHandler("createRectangle", (width, height) => {
  if (figma.editorType !== "figma") throw new Error("Invalid editor type");

  const rect = figma.createRectangle();
  rect.x = 0;
  rect.y = 0;
  rect.name = "Plugin Rectangle # " + Math.floor(Math.random() * 9999);
  rect.fills = [
    {
      type: "SOLID",
      color: {
        r: Math.random(),
        g: Math.random(),
        b: Math.random(),
      },
    },
  ];
  rect.resize(width, height);
  figma.currentPage.appendChild(rect);
  figma.viewport.scrollAndZoomIntoView([rect]);
  return rect.id;
});
