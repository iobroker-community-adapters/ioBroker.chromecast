# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.chromecast` ("Google Home") is an ioBroker adapter that finds Google Cast devices (Chromecast, Google Home /
Nest speakers and displays, TVs with Chromecast built-in, speaker groups) via mDNS, creates one ioBroker device per Cast
device and plays URLs, playlists, YouTube videos and announcements on them. Everything is controlled by writing states;
the only message API is `help` (plus two messages the settings dialog uses).

TypeScript (CommonJS output). Sources live in `src/`, the published/runnable code is the compiled `build/`
(`package.json` `main` is `build/main.js`). `build/` is gitignored — always run the build before starting the adapter or
the integration tests.

## Commands

```bash
npm run build                             # tsc -p tsconfig.build.json  -> build/
npm run watch                             # same in watch mode
npm run check                             # type check only (tsconfig.json, noEmit)
npm run lint                              # eslint (@iobroker/eslint-config, flat config)
npx eslint -c eslint.config.mjs --fix src # autofix + prettier formatting

npm run test:package                      # validates package.json / io-package.json / admin JSON (fast)
npm run test:integration                  # starts a real js-controller + adapter instance, asks "help"
npm run translate                         # translate-adapter, base admin/i18n/en.json
npm run release-patch                     # @alcalzone/release-script, moves README changelog into io-package news
```

There is deliberately **no `prepare` script** — `npm ci`/`npm install` does not build. Because `build/` is neither
committed nor built on install, `common.nogit` is `true` in `io-package.json`: the adapter can only be installed from
npm, not from GitHub. The integration test requires that **no** js-controller is running on the machine, otherwise it
aborts with "JS-Controller is already running!". There is no gulp and no `tasks.ts`: the build is plain `tsc`, the vis
widgets in `widgets/` are static files.

## Architecture

### Layout

| Path | Content |
| --- | --- |
| `src/main.ts` | `ChromecastAdapter extends utils.Adapter`: config, mDNS scanner, devices, `onMessage` |
| `src/lib/chromecastDevice.ts` | `ChromecastDevice`: objects/states of one Cast device and its castv2-player `MediaPlayer` |
| `src/lib/youtube/Youtube.ts` | castv2-client `Application` for the YouTube receiver app (`APP_ID` 233637DE) |
| `src/lib/youtube/YoutubeController.ts` | MDX channel controller; starts videos via `youtube-remote` |
| `src/lib/help.ts` | text and command list of the message `help` (for AI agents / script authors) |
| `src/lib/types.ts` | Cast status shapes (client/player status, media, metadata) and the manual device row |
| `src/lib/adapter-config.d.ts` | augments `ioBroker.AdapterConfig` |
| `src/types/*.d.ts` | hand-written typings for `castv2-player`, `castv2-client`, `node-arp`, `youtube-remote` |
| `admin/jsonConfig.json` | the configuration dialog (`common.adminUI.config = "json"`) |
| `widgets/` | vis widget (static, shipped via `files`) |

`src/lib/adapter-config.d.ts` is hand-maintained and must be kept in sync with `native` in `io-package.json`
(`web`, `webServer`, `manualDevices`) **and** with `admin/jsonConfig.json` — nothing generates it.

### Dependencies without typings

All Cast libraries are CommonJS without typings; `src/types/*.d.ts` declare only what is used. Details that bite:

- `castv2-player` exports **factories**: `MediaPlayer(logger)` / `Scanner(logger)` return the class bound to a logger.
  The device logger maps castv2-player `info` to the adapter's `debug` (it is chatty).
- `castv2-client` is used directly (YouTube) and is therefore a direct dependency, not only a transitive one.
- castv2-client's `Sender.createController()` calls controller constructors ES5-style (without `new`). An ES class
  throws there, so `YoutubeController` is passed as the factory `createYoutubeController()`.
- `node-arp.getMAC()` calls back with `(true, message)` on error.
- `MediaPlayer._client._client` (castv2-client platform sender) and `MediaPlayer._updateDevice()` are private in
  castv2-player but used (YouTube launch, address changes from the scanner).

### Devices and IDs

- Found by mDNS (`Scanner`, rescans every 10 min): ID = MAC address without `:` (via ARP), groups: `groups.<mDNS id
  without ->`.
- Added by hand (`native.manualDevices`, tab "Devices"): ID = the configured name with dots/whitespace → `_` and
  `FORBIDDEN_CHARS` removed; `registerForUpdates` is emulated as a no-op.
- `ChromecastDeviceContext.knownDeviceIds` (per adapter instance, not static, because of compact mode) rejects
  duplicate IDs with an error.
- Each device registers its own `stateChange` listener on the adapter and removes it in `destroy()`; the adapter
  subscribes `*` once. `onStateChange` ignores ack'd writes and states outside `<namespace>.<id>`.
- Writes with ack false are commands (see `help.ts` for the list); the ack comes back with the next status of the
  device, not when the command was sent.
- Object IDs, roles, names and defaults of the states are an external contract (scripts, vis, agents): do not change
  them. `player.state` / `status.playerState` / `player.paused` are partly redundant on purpose.

### Local files

A `player.url2play` that does not start with `http` is read from disk, written to the file storage
`chromecast.0.files/<id>/exportedMedia.mp3` (the instance name is fixed, also for other instances) and played via
`http://<native.webServer>:<port of native.web>/…`. Port 8082 is assumed when no web instance is configured.

### Admin configuration

`admin/jsonConfig.json` with the flat translations `admin/i18n/<lang>.json` (`"i18n": true`). Two controls ask the
running instance via `sendTo`, handled in `onMessage()`:

- `getWebServerIps` with `{ web }` → `selectSendTo` options: the external IPv4 (bind `0.0.0.0`) or IPv6 (bind `::`)
  addresses of the web instance's host, or its single bind address. When the instance is not running, the field falls
  back to a text input.
- `checkWebInstance` with `{ web }` → `textSendTo`: warns about authentication or a localhost bind. The text is
  translated by the instance with `admin/i18n/<system language>.json` (`__dirname` is `build/`, hence `..`).

`common.messagebox` is set; `common.supportedMessages.help` advertises the message API.

## Known quirks (kept on purpose so that existing installations do not change)

- `player.shuffleMode` cannot be written (the handler checks `player.shuffelMode`); documented in `help.ts`.
- `player.state` is 1 (play) also while paused or idle: the device reports `playing`, never `play`.
- `castv2-player`'s `isMuted()` is always `undefined`; the real mute value comes with the player status.
- If the MAC address of a found device cannot be read, the device ends up below `<namespace>.undefined`.
- The default of `player.url2play` is `http:/example.org/playme.mp3` (one slash).
- Metadata numbers (track, season, episode) are written as numbers into string states.

## Release flow

Changelog lives in `README.md` under the `### **WORK IN PROGRESS**` placeholder; `release-script` (config in
`.releaseconfig.json`, plugins `iobroker`, `license`, `manual-review`) moves it into `io-package.json` `common.news`.
CI (`.github/workflows/test-and-release.yml`) uses `ioBroker/testing-action-check@v2` (type check + lint +
`test:package`), `testing-action-adapter@v1` (build + integration test on Node 22/24/26 × Linux/Windows/macOS) and
`testing-action-deploy@v1` (build + npm publish on version tags).
