import type { PlaylistEntry, PlaylistParser } from 'playlist-parser';

/*
 * The M3U parser, instead of the one of playlist-parser (PLS and ASX still come from there). Its expression only
 * understood `#EXTINF:<length>,<artist> - <title>`:
 * - without " - " the length stayed in the title: "#EXTINF:-1,Radio Bob" became the title "-1,Radio Bob";
 * - "Queen - Song - Remastered" became the artist "Queen - Song " and the title "Remastered";
 * - the attributes of radio and IPTV lists (`#EXTINF:-1 tvg-logo="…" group-title="…",Name`) were part of the title;
 * - a line like `#EXTVLCOPT:network-caching=1000` between `#EXTINF` and the file became the title.
 *
 * The format:
 *     #EXTM3U
 *     #EXTINF:<length> [key="value" ...],<artist> - <title>
 *     #<other directives or comments, ignored>
 *     <file or URL>
 * A file without `#EXTINF` (also every line of a simple M3U without `#EXTM3U`) is an entry without a title.
 */

/** The fields of `#EXTINF:<length> [attributes],<display title>` (the text after the colon) */
function parseExtInf(info: string): PlaylistEntry {
    // the display title starts after the first comma that is not in the quotes of an attribute
    let inQuotes = false;
    let comma = -1;
    for (let i = 0; i < info.length; i++) {
        if (info[i] === '"') {
            inQuotes = !inQuotes;
        } else if (info[i] === ',' && !inQuotes) {
            comma = i;
            break;
        }
    }
    const length = parseFloat(comma === -1 ? info : info.substring(0, comma));
    const display = comma === -1 ? '' : info.substring(comma + 1).trim();
    // "Artist - Title" (the convention of Winamp): the first " - " separates, the rest belongs to the title
    const dash = display.indexOf(' - ');
    return {
        length: Number.isFinite(length) ? length : 0,
        artist: dash > 0 ? display.substring(0, dash).trim() : '',
        title: dash > 0 ? display.substring(dash + 3).trim() : display,
    };
}

/** The entries of an M3U playlist (not HLS: its lines are segments, see MediaInfo) */
function parse(playlist: string): PlaylistEntry[] {
    const entries: PlaylistEntry[] = [];
    let info: PlaylistEntry | undefined;
    for (const rawLine of playlist.split(/\r\n|\r|\n/)) {
        // trim() also removes a byte order mark at the start of the file
        const line = rawLine.trim();
        if (!line) {
            continue;
        }
        if (line.startsWith('#')) {
            if (line.toUpperCase().startsWith('#EXTINF:')) {
                info = parseExtInf(line.substring('#EXTINF:'.length));
            }
            continue;
        }
        entries.push({ ...info, file: line });
        info = undefined;
    }
    return entries;
}

export const M3U: PlaylistParser = { name: 'm3u', parse };
