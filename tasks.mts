/*!
 * Build tasks of ioBroker.chromecast beyond `tsc`
 *
 * Two front-ends live next to the adapter, both built with vite:
 *
 *   src-devices/       -> admin/dm-widgets/       the widget ioBroker.devices shows in its dashboard
 *                                                 (module federation, `common.deviceWidgets`)
 *   src-webcomponents/ -> admin/webcomponents/    the web component `<iob-chromecast-player>` for vis-2, devices,
 *                                                 Aura and admin (`common.webComponents`): one ES module and its
 *                                                 manifest
 *
 * `npm run build` builds only the adapter (that is what CI runs). The results of the two front-ends are committed
 * instead of being built on install or in CI: run `npm run build:devices` / `npm run build:wc` and commit
 * `admin/dm-widgets` / `admin/webcomponents` whenever something under `src-devices/` or `src-webcomponents/` changed.
 * `build:wc` also writes the short form of the manifest into `common.webComponents` of io-package.json.
 *
 * This file is run straight from source - `node tasks.mts` - by the type stripping node brings along, so it must
 * stay free of syntax that a compiler would have to rewrite (`enum`, `namespace`, parameter properties).
 */
import { existsSync } from 'node:fs';
import { buildReact, copyFiles, deleteFoldersRecursive, npmInstall } from '@iobroker/build-tools';

/** Directory of this file, and with it the root of the adapter */
const ROOT: string = import.meta.dirname;
/** Directory of the ioBroker.devices widget */
const SRC_DEVICES = `${ROOT}/src-devices`;
/** Directory of the web component */
const SRC_WC = `${ROOT}/src-webcomponents`;

async function installIfNeeded(dir: string): Promise<void> {
    if (!existsSync(`${dir}/node_modules`)) {
        await npmInstall(dir);
    }
}

/**
 * The ioBroker.devices widget. `mf-manifest.json` is copied on purpose: the host fetches it next to the remote
 * entry to decide from the shared modules which GUI API generation the widget was built against. The i18n files are
 * copied too, the host loads them for the settings dialog of the widget.
 */
async function buildDevices(): Promise<void> {
    deleteFoldersRecursive(`${ROOT}/admin/dm-widgets`);
    deleteFoldersRecursive(`${SRC_DEVICES}/build`);
    await installIfNeeded(SRC_DEVICES);
    await buildReact(SRC_DEVICES, { rootDir: SRC_DEVICES, vite: true });
    copyFiles(['src-devices/build/**/*', '!src-devices/build/index.html'], 'admin/dm-widgets/');
    copyFiles(['src-devices/img/**/*'], 'admin/dm-widgets');
    copyFiles(['src-devices/src/i18n/*.json'], 'admin/dm-widgets/i18n');
}

/**
 * The web component: `chromecast-player.js` and `chromecast-player.json`. The vite build writes the manifest and
 * fails if it does not pass the check of `@iobroker/web-components`.
 */
async function buildWebComponents(): Promise<void> {
    deleteFoldersRecursive(`${ROOT}/admin/webcomponents`);
    deleteFoldersRecursive(`${SRC_WC}/build`);
    await installIfNeeded(SRC_WC);
    await buildReact(SRC_WC, { rootDir: SRC_WC, vite: true });
    copyFiles(['src-webcomponents/build/*.js', 'src-webcomponents/build/*.json'], 'admin/webcomponents/');
}

async function main(): Promise<void> {
    if (process.argv.includes('--devices')) {
        await buildDevices();
    } else if (process.argv.includes('--wc')) {
        await buildWebComponents();
    } else {
        await buildDevices();
        await buildWebComponents();
    }
}

main().catch((e: unknown) => {
    console.error(`Cannot build: ${e as string}`);
    process.exit(2);
});
