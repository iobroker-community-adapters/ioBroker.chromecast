import react from '@vitejs/plugin-react';
import { checkManifest, getReactImportPath, REACT_SPECIFIERS, type WebComponentText } from '@iobroker/web-components';
import { readFileSync } from 'node:fs';
import type { Plugin, UserConfig } from 'vite';

// with the extension: Vite may load its config natively, without a bundler that would add it
import { COMPONENT, MODULE_FOLDER } from './src/constants.ts';
import { buildManifest, type NativeWidget } from './src/manifest.ts';
import {
    LANGUAGES,
    MANIFEST_KEYS,
    PREFIX,
    WORD_KEYS,
    type Dictionary,
    type Language,
    type ManifestKey,
} from './src/texts.ts';

/**
 * The web component `<iob-chromecast-player>`: one ES module, `admin/webcomponents/chromecast-player.js`, with its
 * manifest `chromecast-player.json` next to it (`common.webComponents`). Every host - vis-2, devices, Aura, admin -
 * reads them from `/adapter/chromecast/webcomponents/`. No module federation: the host shares nothing but the socket.
 *
 * React is not bundled: the four React imports point at `lib/esm/react-19.js`, which web and admin serve beside
 * `adapter/`. The path is relative to the module, so a path prefix of a reverse proxy stays.
 */

/** Reads a file of the adapter, relative to this one */
function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

/**
 * The words of the ioBroker.devices widget (`src-devices/src/i18n`) without their prefix, in every language. A word
 * without English stops the build; another missing language is taken in English.
 */
function readWords(): Record<Language, Record<string, string>> {
    const words = {} as Record<Language, Record<string, string>>;
    for (const lang of LANGUAGES) {
        const file = readJson<Record<string, string>>(`../src-devices/src/i18n/${lang}.json`);
        const dictionary: Record<string, string> = {};
        for (const key of [...WORD_KEYS, ...MANIFEST_KEYS]) {
            const text = file[`${PREFIX}${key}`] || words.en?.[key];
            if (!text) {
                throw new Error(`The word "${PREFIX}${key}" has no English text`);
            }
            dictionary[key] = text;
        }
        words[lang] = dictionary;
    }
    return words;
}

/** The ioBroker.devices widget of the adapter: the component is called like it */
function readNativeWidget(): NativeWidget {
    const io = readJson<{
        common: {
            deviceWidgets?: {
                components?: { name: string; label: WebComponentText; description?: WebComponentText }[];
            };
        };
    }>('../io-package.json');
    const widget = io.common.deviceWidgets?.components?.find(
        component => component.name === 'ChromecastPlayerComponent',
    );
    if (!widget) {
        throw new Error('io-package.json has no ioBroker.devices widget "ChromecastPlayerComponent"');
    }
    return { label: widget.label, description: widget.description };
}

const WORDS = readWords();

/** The words the module shows - without those of the manifest */
const MODULE_WORDS: Record<string, Partial<Dictionary>> = Object.fromEntries(
    LANGUAGES.map(lang => [lang, Object.fromEntries(WORD_KEYS.map(key => [key, WORDS[lang][key]]))]),
);

/** Writes the manifest next to the module, checked like a host checks it */
function manifestFile(): Plugin {
    return {
        name: 'chromecast-web-component-manifest',
        generateBundle() {
            const manifest = buildManifest((key: ManifestKey) => {
                const text = {} as ioBroker.Translated;
                for (const lang of LANGUAGES) {
                    text[lang] = WORDS[lang][key];
                }
                return text;
            }, readNativeWidget());
            const problem = checkManifest(manifest);
            if (problem) {
                this.error(`${COMPONENT.manifest}: ${problem}`);
            }
            this.emitFile({
                type: 'asset',
                fileName: COMPONENT.manifest,
                source: `${JSON.stringify(manifest, null, 4)}\n`,
            });
        },
    };
}

const reactImport = getReactImportPath(`${MODULE_FOLDER}/${COMPONENT.module}`);

const config: UserConfig = {
    plugins: [react(), manifestFile()],
    define: {
        'process.env.NODE_ENV': JSON.stringify('production'),
        __CHROMECAST_WORDS__: JSON.stringify(MODULE_WORDS),
    },
    build: {
        target: 'es2022',
        outDir: './build',
        emptyOutDir: true,
        lib: {
            entry: './src/player.tsx',
            formats: ['es'],
            fileName: (): string => COMPONENT.module,
        },
        rollupOptions: {
            external: [...REACT_SPECIFIERS],
            output: {
                paths: Object.fromEntries(REACT_SPECIFIERS.map(specifier => [specifier, reactImport])),
                // one file: a host imports exactly one URL
                codeSplitting: false,
                // library mode keeps whitespace for the bundler of a consumer; this module is loaded as it is
                minify: true,
            },
        },
    },
};

export default config;
