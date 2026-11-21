# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`iobroker.chromecast` ("Google Home") is an ioBroker adapter that finds Google Cast devices (Chromecast, Google Home /
Nest speakers and displays, TVs with Chromecast built-in, speaker groups) via mDNS, creates one ioBroker device per Cast
device and plays URLs, playlists, YouTube videos and announcements on them. Everything is controlled by writing states;
the only message API is `help` (plus `chromecast:getDevices` for the settings of the devices widget and two messages
the settings dialog uses). It also brings a widget for ioBroker.devices and a web component (see below).

TypeScript (CommonJS output). Sources live in `src/`, the published/runnable code is the compiled `build/`
(`package.json` `main` is `build/main.js`). `build/` is gitignored — always run the build before starting the adapter or
the integration tests. Two front-ends live next to it, each a vite project with its own `package.json`: `src-devices/`
(the ioBroker.devices widget) and `src-webcomponents/` (the web component); their output in `admin/` is committed.

## Commands

```bash
npm run build                             # everything: build:ts + build:front
npm run build:ts                          # tsc -p tsconfig.build.json  -> build/
npm run watch                             # build:ts in watch mode
npm run check                             # type check only (tsconfig.json, noEmit)
npm run lint                              # eslint (@iobroker/eslint-config, flat config)
npx eslint -c eslint.config.mjs --fix src # autofix + prettier formatting

npm run build:devices                     # src-devices -> admin/dm-widgets (npm install there if needed)
npm run build:wc                          # src-webcomponents -> admin/webcomponents + common.webComponents
npm run build:front                       # both
npm run check:devices / check:wc          # type check of a front-end
npm run lint:devices / lint:wc            # eslint of a front-end (the root lint ignores src-*)
npm run test:package                      # validates package.json / io-package.json / admin JSON (fast)
npm run test:integration                  # starts a real js-controller + adapter instance, asks "help"
npm run translate                         # translate-adapter, base admin/i18n/en.json
npm run release-patch                     # @alcalzone/release-script, moves README changelog into io-package news
```

There is deliberately **no `prepare` script** — `npm ci`/`npm install` does not build. Because `build/` is neither
committed nor built on install, `common.nogit` is `true` in `io-package.json`: the adapter can only be installed from
npm, not from GitHub. The integration test requires that **no** js-controller is running on the machine, otherwise it
aborts with "JS-Controller is already running!". There is no gulp: `npm run build` (that is what CI
runs) is `tsc` plus `tasks.mts` (run by node directly, type stripping), which builds the two front-ends with
`@iobroker/build-tools`; the vis widgets in `widgets/` are static files. The front-end output is still committed: run
`build` (or `build:devices` / `build:wc`) and commit `admin/dm-widgets` / `admin/webcomponents` whenever `src-devices/`
or `src-webcomponents/` changed.

## Architecture

### Layout

| Path | Content |
| --- | --- |
| `src/main.ts` | `ChromecastAdapter extends utils.Adapter`: config, mDNS scanner, devices, `onMessage` |
| `src/lib/chromecastDevice.ts` | `ChromecastDevice`: objects/states of one Cast device and its `MediaPlayer` |
| `src/lib/cast/` | port of the archived castv2-player 2.1.3: `Scanner` (mDNS); `MediaPlayer` = `PersistentClient` (receiver connection, reconnects) + `PersistentPlayer` (media app, announcements) + `Playlist`/`MediaInfo` (read URLs, M3U/PLS/ASX, ICY); `m3u.ts` = own M3U parser |
| `src/lib/youtube/Youtube.ts` | castv2-client `Application` for the YouTube receiver app (`APP_ID` 233637DE) |
| `src/lib/youtube/YoutubeController.ts` | MDX channel controller; starts videos via `youtube-remote` |
| `src/lib/help.ts` | text and command list of the message `help` (for AI agents / script authors) |
| `src/lib/types.ts` | Cast status shapes (client/player status, media, metadata) and the manual device row |
| `src/lib/adapter-config.d.ts` | augments `ioBroker.AdapterConfig` |
| `src/types/*.d.ts` | hand-written typings for `castv2-client`, `icy`, `mime-types`, `multicast-dns`, `node-arp`, `playlist-parser`, `youtube-remote` |
| `admin/jsonConfig.json` | the configuration dialog (`common.adminUI.config = "json"`) |
| `src-devices/` | widget "Cast player" for ioBroker.devices (`common.deviceWidgets`, module federation `DevicesWidgetChromecastSet`): `ChromecastPlayerComponent` (what plays, play / pause / stop), `i18n/` = the one dictionary (prefix `chromecastdm_`), dev harness `npm start` (`?mock` = simulated device) |
| `src-webcomponents/` | web component `<iob-chromecast-player>` (`@iobroker/web-components`, `common.webComponents`): one ES module + manifest, React from `lib/esm/react-19.js`; words from `src-devices/src/i18n`, name from `common.deviceWidgets` |
| `admin/dm-widgets/`, `admin/webcomponents/` | build output of the two front-ends, committed |
| `widgets/` | vis widget (static, shipped via `files`) |

`src/lib/adapter-config.d.ts` is hand-maintained and must be kept in sync with `native` in `io-package.json`
(`web`, `webServer`, `manualDevices`) **and** with `admin/jsonConfig.json` — nothing generates it.

### Dependencies without typings

All Cast libraries are CommonJS without typings; `src/types/*.d.ts` declare only what is used. Details that bite:

- `src/lib/cast` was the npm package castv2-player (archived, so it is part of the adapter now). Its classes get a
  `CastLogger`: the media player logger maps `info` to the adapter's `debug` (it is chatty), the scanner logs as is.
  `ChromecastDeviceContext.createMediaPlayer` creates the player (a test can pass a fake there).
- castv2-client `Client` (the platform sender): when the device closes the connection, its own `close` handler runs
  first and sets `client` to `null` (`Sender.close()`), so a later `close` handler must not use `client.socket`.
- The answer to the media `getStatus()` only comes as event `playerStatus` if the device broadcasts it. Some Android TV
  apps do, and answer every request with another status without playlist (hence `statusRequested` in the device).
- mime-types 3 (`lookup()` only: the content type when a server sends none, and of the entries of a playlist). Not
  3.0.0: it resolved `.mp4` to `application/mp4`. Compared with the 2.x of castv2-player: `.aac` is `audio/aac` (was
  `audio/x-aac`), `.wav` `audio/wav` (was `audio/wave`), `.mts` `video/mp2t`, and `.m2ts`, `.m4b`, `.adts` are known;
  the playlist types (`.m3u`, `.asx`, `.asf`) are the same.
- castv2-client's `Sender.createController()` calls controller constructors ES5-style (without `new`). An ES class
  throws there, so `YoutubeController` is passed as the factory `createYoutubeController()`.
- `node-arp.getMAC()` calls back with `(true, message)` on error.
- playlist-parser: only its PLS and ASX parsers are used. Its M3U expression understood only
  `#EXTINF:<length>,<artist> - <title>` (else the length stayed in the title: "-1,Radio Bob"), so M3U is parsed by
  `src/lib/cast/m3u.ts` (attributes, `#EXTVLCOPT`, BOM, CRLF).
- `MediaPlayer.castClient` (the castv2-client platform sender) launches the YouTube app.

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
`<namespace>/<id>/exportedMedia.mp3` (meta object `<namespace>`, created on first use) and played via
`http://<native.webServer>:<port of native.web>/<namespace>/<id>/exportedMedia.mp3`. Port 8082 is assumed when no web
instance is configured.

### Admin configuration

`admin/jsonConfig.json` with the flat translations `admin/i18n/<lang>.json` (`"i18n": true`). Two controls ask the
running instance via `sendTo`, handled in `onMessage()`:

- `getWebServerIps` with `{ web }` → `selectSendTo` options: the external IPv4 (bind `0.0.0.0`) or IPv6 (bind `::`)
  addresses of the web instance's host, or its single bind address. When the instance is not running, the field falls
  back to a text input.
- `checkWebInstance` with `{ web }` → `textSendTo`: warns about authentication or a localhost bind. The text is
  translated by the instance with `admin/i18n/<system language>.json` (`__dirname` is `build/`, hence `..`).

`common.messagebox` is set; `common.supportedMessages.help` advertises the message API.

The settings of the devices widget pick the device with `selectSendTo` `chromecast:getDevices` (answered by
`getDeviceOptions()`: the device objects of the instance, value = the ID below the namespace). The web component uses
an `objectId` picker (`types: device`, `root: chromecast`) instead, so it works without a running instance. Both derive
playing / paused / buffering from `status.playerState` (it tells buffering from playing, `player.state` does not),
"play" writes `player.play` when paused and `status.playing` (play the last URL again) otherwise.

## Known quirks (kept on purpose so that existing installations do not change)

- If the MAC address of a found device cannot be read, the device ends up below `<namespace>.undefined`.
- The default of `player.url2play` is `http:/example.org/playme.mp3` (one slash).
- Metadata numbers (track, season, episode) are written as numbers into string states.

## Release flow

Changelog lives in `README.md` under the `### **WORK IN PROGRESS**` placeholder; `release-script` (config in
`.releaseconfig.json`, plugins `iobroker`, `license`, `manual-review`) moves it into `io-package.json` `common.news`.
CI (`.github/workflows/test-and-release.yml`) uses `ioBroker/testing-action-check@v2` (type check + lint +
`test:package`), `testing-action-adapter@v1` (build + integration test on Node 22/24/26 × Linux/Windows/macOS) and
`testing-action-deploy@v1` (build + npm publish on version tags).
