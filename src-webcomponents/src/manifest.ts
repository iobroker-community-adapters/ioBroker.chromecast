/**
 * The manifest of the component. Read by the build only (`vite.config.ts`), which writes it as
 * `chromecast-player.json` next to the module - a host reads that file for its palette and its settings without
 * loading the module.
 */
import type { WebComponentManifest, WebComponentText } from '@iobroker/web-components';

// with the extension: `vite.config.ts` imports this file, and Vite may load its config natively
import { COMPONENT } from './constants.ts';
import { LANGUAGES, type ManifestKey } from './texts.ts';

/** What the ioBroker.devices widget is called: `common.deviceWidgets.components[]` of io-package.json */
export interface NativeWidget {
    label: WebComponentText;
    description?: WebComponentText;
}

/**
 * A text in every language
 *
 * @param text a string or `{ en, de, ... }`
 */
function inAllLanguages(text: WebComponentText): ioBroker.Translated {
    const result = {} as ioBroker.Translated;
    for (const lang of LANGUAGES) {
        result[lang] = typeof text === 'string' ? text : text[lang] || text.en;
    }
    return result;
}

/**
 * The manifest
 *
 * @param word a word of the settings in every language
 * @param native the ioBroker.devices widget: the component is called like it, so that ioBroker.devices can offer the
 *   native widget instead
 */
export function buildManifest(
    word: (key: ManifestKey) => ioBroker.Translated,
    native: NativeWidget,
): WebComponentManifest {
    return {
        $schema: 'https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json',
        manifestVersion: 1,
        tag: COMPONENT.tag,
        name: inAllLanguages(native.label),
        description: native.description,
        // relative to this file: the picture of the ioBroker.devices widget
        icon: '../dm-widgets/player.png',
        module: COMPONENT.module,
        size: { width: 400, height: 220 },
        settings: {
            type: 'panel',
            items: {
                device: {
                    type: 'objectId',
                    types: 'device',
                    // every instance of the adapter; the element takes the instance from the ID
                    root: 'chromecast',
                    label: word('device'),
                    help: word('deviceHelp'),
                },
                title: { type: 'text', label: word('name'), help: word('nameHelp') },
                showCover: { type: 'checkbox', default: true, label: word('showCover') },
                showSkip: { type: 'checkbox', default: true, label: word('showSkip') },
                showVolume: { type: 'checkbox', default: true, label: word('showVolume') },
                accent: { type: 'color', label: word('accent'), help: word('accentHelp') },
            },
        },
    };
}
