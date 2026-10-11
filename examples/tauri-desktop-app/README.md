# Tauri Desktop Example

A runnable Tauri 2 application with a vanilla TypeScript frontend and Rust backend,
initialized using the official [Create a Project guide](https://v2.tauri.app/start/create-project/):

```sh
pnpm dlx create-tauri-app@latest examples/tauri-desktop-app --template vanilla-ts --manager pnpm --identifier com.monoreponetworker.example --yes
```

## Run

Install the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), including
a current stable Rust toolchain (the generated template uses Rust's 2024 edition).
Windows also requires Microsoft C++ Build Tools and WebView2. Use the
repository's supported Node.js version and pnpm.

From the repository root:

```sh
pnpm install
pnpm --dir examples/tauri-desktop-app tauri dev
```

Enter a name and select **Greet** for a Rust response. Select **Send notification**
for a Rust event. Requests with invalid payloads reject with a Rust error.
The frontend imports the library source directly, like the other examples; no
separate library build is needed.

`pnpm --dir examples/tauri-desktop-app dev` serves only the frontend at
http://localhost:1420. A browser has no Rust backend, so controls stay disabled
and the app reports that the desktop runtime is required.

## Transport

- `src/network/networkSides.ts` declares the frontend and Rust event contracts.
- `src/network/networkChannel.ts` maps events to native Rust commands with
  [`invoke`](https://v2.tauri.app/develop/calling-rust/). Its returned Promise
  resolves or rejects `channel.request` directly; no response envelope is needed.
- `src-tauri/src/lib.rs` defines ordinary `greet(name)` and `notify()` commands.
  Tauri deserializes command arguments, and `greet` rejects blank names. Rust does
  not mirror or depend on the library's `MonorepoMessage` format.
- Rust sends a string-valued `notification` event to the calling window using
  [`emit_to`](https://v2.tauri.app/develop/calling-frontend/). The frontend awaits
  event registration before enabling controls. `.listensTo(RUST, ...)` wraps each
  raw Tauri event with `type: "emit"`, `from: RUST.name`, a fresh message ID,
  the event name, and a positional payload array. The listener is cleaned up on
  hot reload.
- Fire-and-forget `channel.emit` transport failures are reported separately,
  since that API does not return a Promise.

Only the main local window has event-listening capabilities. No opener or other
plugin is required. The example's Rust command does not expose filesystem or
shell operations.

## Verify And Build

```sh
pnpm --dir examples/tauri-desktop-app typecheck
pnpm --dir examples/tauri-desktop-app build
cargo test --manifest-path examples/tauri-desktop-app/src-tauri/Cargo.toml
pnpm --dir examples/tauri-desktop-app tauri build
```

The workspace's `pnpm check` includes this example's TypeScript check and mocked
transport tests, but Rust tests and desktop packaging require the native
prerequisites and run separately.
