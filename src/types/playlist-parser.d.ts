// Minimal typings for playlist-parser (CommonJS, no own typings)
declare module 'playlist-parser' {
    export interface PlaylistEntry {
        file: string;
        title?: string;
        artist?: string;
        length?: number | string;
    }

    export interface PlaylistParser {
        name: string;
        parse(playlist: string): PlaylistEntry[];
    }

    export const M3U: PlaylistParser;
    export const PLS: PlaylistParser;
    export const ASX: PlaylistParser;
}
