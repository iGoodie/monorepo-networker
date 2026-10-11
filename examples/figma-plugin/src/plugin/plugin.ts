import { PLUGIN, UI } from "@common/networkSides";
import { PLUGIN_CHANNEL } from "@plugin/plugin.network";
import { Networker } from "../../../../src";

async function bootstrap() {
  Networker.initialize(PLUGIN);

  if (figma.editorType === "figma") {
    figma.showUI(__html__, {
      width: 800,
      height: 650,
      title: "My Figma Plugin!",
    });
  }

  console.log("Bootstrapped @", Networker.getCurrentSide().name);

  PLUGIN_CHANNEL.emit(UI, "hello", "Hey there, UI!");
}

bootstrap();
