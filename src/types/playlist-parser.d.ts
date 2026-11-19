// Minimal typings for playlist-parser (CommonJS, no own typings)
declare module 'playlist-parser' {
    export interface PlaylistEntry {
        /** Missing in a PLS entry without "FileN=" */
        file?: string;
        title?: string;
        artist?: string;
        length?: number | string;
    }

    export interface PlaylistParser {
        name: string;
        /** M3U: undefined for each entry it cannot parse (e.g. HLS tags) */
        parse(playlist: string): (PlaylistEntry | undefined)[];
    }

    export const M3U: PlaylistParser;
    export const PLS: PlaylistParser;
    export const ASX: PlaylistParser;
}
