import { PLUGIN, UI } from "@common/networkSides";
import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { Networker } from "../../../../src";
import { UI_CHANNEL } from "./networkChannel";

Networker.initialize(UI);

const rootElement = document.getElementById("root") as HTMLElement;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log("Bootstrapped @", Networker.getCurrentSide().name);

function App() {
  const focusHistory = useRef<string[]>([]);

  const onClick = async () => {
    const rectId = await UI_CHANNEL.request(
      PLUGIN,
      "createRectangle",
      100,
      100
    );

    console.log("Created rect with id", rectId);
  };

  useEffect(() => {
    return UI_CHANNEL.subscribeListener("focusOnElement", (elementId) => {
      focusHistory.current.push(elementId);
      document.getElementById(elementId)?.focus();
    });
  }, []);

  return (
    <main>
      <h1>My Figma Plugin</h1>
      <button onClick={onClick}>Create a new Rectangle</button>
    </main>
  );
}
