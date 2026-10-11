import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { Networker } from "../../../../src";
import { SERVER, UI } from "../../common/networkSides";
import { UI_CHANNEL } from "./networkChannel";

Networker.initialize(UI, UI_CHANNEL);

console.log("We're at", Networker.getCurrentSide().name);

UI_CHANNEL.emit(SERVER, "markPresence", [true]);

// This one corresponds to SERVER's `getServerTime(): number;` event
UI_CHANNEL.request(SERVER, "getServerTime", []).then((serverTime) => {
  console.log('Server responded with "' + serverTime + '" !');
});

const rootElement = document.getElementById("root") as HTMLElement;
const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

function App() {
  const focusHistory = useRef<string[]>([]);

  useEffect(() => {
    return UI_CHANNEL.subscribe("focusOnElement", (elementId) => {
      focusHistory.current.push(elementId);
      document.getElementById(elementId)!.focus();
    });
  }, []);

  return <main>{/* ... Omitted for simplicity */}</main>;
}
