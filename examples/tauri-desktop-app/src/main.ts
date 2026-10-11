import { Networker } from "../../../src";
import {
  FRONTEND_CHANNEL,
  initFrontendChannel,
} from "./network/networkChannel";
import { FRONTEND, RUST } from "./network/networkSides";

const form = document.querySelector<HTMLFormElement>("#greet-form")!;
const nameInput = document.querySelector<HTMLInputElement>("#greet-input")!;
const greetButton = document.querySelector<HTMLButtonElement>("#greet-button")!;
const notifyButton =
  document.querySelector<HTMLButtonElement>("#notify-button")!;
const response = document.querySelector<HTMLElement>("#greet-msg")!;
const notification = document.querySelector<HTMLElement>("#notification")!;
const status = document.querySelector<HTMLElement>("#status")!;
const errorOutput = document.querySelector<HTMLElement>("#error")!;

function showError(error: unknown) {
  errorOutput.textContent =
    error instanceof Error ? error.message : String(error);
}

async function start() {
  Networker.initialize(FRONTEND);

  await initFrontendChannel(showError);

  FRONTEND_CHANNEL.subscribeListener("notification", (payload) => {
    notification.textContent = payload.message;
  });

  status.textContent = "Rust connected";
  greetButton.disabled = false;
  notifyButton.disabled = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    greetButton.disabled = true;
    errorOutput.textContent = "";
    try {
      response.textContent = await FRONTEND_CHANNEL.request(RUST, "greet", {
        name: nameInput.value,
      });
    } catch (error) {
      showError(error);
    } finally {
      greetButton.disabled = false;
    }
  });

  notifyButton.addEventListener("click", () => {
    errorOutput.textContent = "";
    FRONTEND_CHANNEL.emit(RUST, "notify");
  });

  if (import.meta.hot) {
    import.meta.hot.dispose(() => FRONTEND_CHANNEL.close());
  }
}

void start().catch((error) => {
  status.textContent = "Backend unavailable";
  showError(error);
});
