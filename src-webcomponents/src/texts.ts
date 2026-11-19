/**
 * The words of the component. They are those of the ioBroker.devices widget - `src-devices/src/i18n/<lang>.json`,
 * key `chromecastdm_<word>` - so there is one dictionary for both; `vite.config.ts` picks them by these lists.
 */

export const LANGUAGES = ['en', 'de', 'ru', 'pt', 'nl', 'fr', 'it', 'es', 'pl', 'uk', 'zh-cn'] as const;

export type Language = (typeof LANGUAGES)[number];

/** The words the element shows */
export const WORD_KEYS = [
    'play',
    'pause',
    'stop',
    'prev',
    'next',
    'volume',
    'mute',
    'unmute',
    'nothing',
    'noDevice',
    'notFound',
    'offline',
    'playing',
    'paused',
    'buffering',
    'idle',
    'position',
] as const;

export type WordKey = (typeof WORD_KEYS)[number];

/** The words of the settings in the manifest */
export const MANIFEST_KEYS = [
    'device',
    'deviceHelp',
    'name',
    'nameHelp',
    'showCover',
    'showSkip',
    'showVolume',
    'accent',
    'accentHelp',
] as const;

export type ManifestKey = (typeof MANIFEST_KEYS)[number];

export type Dictionary = Record<WordKey, string>;

/** The prefix of the words in the i18n files of the ioBroker.devices widget */
export const PREFIX = 'chromecastdm_';
