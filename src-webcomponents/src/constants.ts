/**
 * What the module and the build share: the tag and files of the component, the states it reads and pure helpers.
 *
 * Imported by `vite.config.ts` as well (the tag and the files), so nothing in here may touch the DOM.
 */

/** The custom element and the files the build writes into `admin/webcomponents/` */
export const COMPONENT = {
    tag: 'iob-chromecast-player',
    module: 'chromecast-player.js',
    manifest: 'chromecast-player.json',
} as const;

/** Where `tasks.mts` puts the module in the admin folder; the React import is relative to it */
export const MODULE_FOLDER = 'webcomponents';

/**
 * The states of a Cast device the player reads, below `chromecast.<n>.<device>`. `status.playerState` tells playing,
 * paused, buffering and idle apart (`player.state` does not tell buffering from playing).
 */
export const PLAYER_STATES = [
    'status.connected',
    'status.playerState',
    'status.displayName',
    'status.text',
    'metadata.title',
    'metadata.artist',
    'metadata.album',
    'metadata.cover',
    'player.contentId',
    'player.currentTime',
    'player.duration',
    'player.volume',
    'player.mute',
] as const;

export type PlayerState = (typeof PLAYER_STATES)[number];

/** Apps that mean "nothing plays": the idle screen, and the media receiver without media */
export const IDLE_APPS = ['Backdrop', 'Default Media Receiver'];

/** The values of the settings of `<iob-chromecast-player>`; a setting without a value is missing */
export interface PlayerSettings {
    [name: string]: string | number | boolean | undefined;
    /** The device object, e.g. `chromecast.0.dce55b6815a6` or `chromecast.0.groups.<id>` */
    device?: string;
    title?: string;
    showCover?: boolean;
    showSkip?: boolean;
    showVolume?: boolean;
    accent?: string;
}

/**
 * The device object a setting names, or null if it names none of an instance of this adapter
 *
 * @param device the setting `device`
 */
export function parseDeviceId(device: unknown): string | null {
    if (typeof device !== 'string') {
        return null;
    }
    const id = device.trim();
    return /^chromecast\.\d+\.[^.]/.test(id) ? id : null;
}

/**
 * The name of a common.name in a language: the device objects have the name of the Cast device with "_" for spaces
 *
 * @param name `common.name`
 * @param lang the language of the system
 */
export function getName(name: ioBroker.StringOrTranslated | undefined, lang: ioBroker.Languages): string {
    if (!name) {
        return '';
    }
    const text = typeof name === 'string' ? name : name[lang] || name.en || '';
    return text.replace(/_/g, ' ');
}

/**
 * The file name of an http(s) URL - the title of a stream or a file without metadata
 *
 * @param url `player.contentId`
 */
export function fileName(url: string): string {
    if (!/^https?:\/\//.test(url)) {
        return '';
    }
    try {
        const parsed = new URL(url);
        const last = parsed.pathname.split('/').filter(Boolean).pop();
        return last ? decodeURIComponent(last) : parsed.host;
    } catch {
        return '';
    }
}

/**
 * Seconds as m:ss or h:mm:ss
 *
 * @param seconds the time
 */
export function formatTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = String(total % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
