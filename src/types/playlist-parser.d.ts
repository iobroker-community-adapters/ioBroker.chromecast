// Minimal typings for playlist-parser (CommonJS, no own typings). Its M3U parser is replaced by src/lib/cast/m3u.ts
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
        parse(playlist: string): (PlaylistEntry | undefined)[];
    }

    export const PLS: PlaylistParser;
    export const ASX: PlaylistParser;
}
