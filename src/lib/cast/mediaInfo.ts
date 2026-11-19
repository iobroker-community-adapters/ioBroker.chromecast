import { EventEmitter } from 'node:events';
import type { ClientRequest, RequestOptions } from 'node:http';
import { Writable } from 'node:stream';
import { urlToHttpOptions } from 'node:url';
import { inspect } from 'node:util';
import * as icy from 'icy';
import { lookup } from 'mime-types';
import { ASX, M3U, PLS, type PlaylistParser } from 'playlist-parser';

import type { CastMetadata } from '../types';
import type { CastLogger } from './castLogger';

/** Content types that the devices cannot play. They seem to play ogg if the contentType is given. */
const MIME_BLACKLIST: string[] = [];

/** One media URL with what is known about it */
export interface MediaInfoItem {
    url: string;
    /** From the HTTP header, else guessed from the extension (false if unknown) */
    contentType: string | false | undefined;
    metadata: CastMetadata;
}

/** url.resolve() of the JS version */
function resolveUrl(baseUrl: string, file: string): string {
    try {
        return new URL(file, baseUrl).href;
    } catch {
        return file;
    }
}

/** A stream that discards everything (keeps an ICY stream flowing to get its metadata) */
function devNull(): Writable {
    return new Writable({
        write(_chunk, _encoding, callback) {
            setImmediate(callback);
        },
    });
}

/** Reads the HTTP header (and, for playlists, the content) of a URL to find the media to play */
export class MediaInfo extends EventEmitter {
    readonly EVENT_UPDATE = 'mediaInfoUpdate';

    private items: MediaInfoItem[] = [];
    private icyConnection: ClientRequest | undefined;
    private contentType: string | false | undefined;

    constructor(
        private readonly name: string,
        private url: string,
        private readonly log: CastLogger,
    ) {
        super();
    }

    getInfoPromise(): Promise<MediaInfoItem[]> {
        return this.getIcyConnectionPromise().then(([baseUrl, res]) => this.parseIcyHeaderPromise(baseUrl, res));
    }

    close(): void {
        this.log.info(`${this.name} - Closing mediaInfo`);
        this.closeIcyConnection();
    }

    private getIcyConnectionPromise(): Promise<[string, icy.IcyResponse]> {
        return new Promise((resolve, reject) => {
            const connect = (): void => {
                try {
                    const con = MediaInfo.getRequestOptions(this.url);

                    const request = icy.get(con, res => {
                        res.headers = res.headers || res.res?.headers;
                        const statusCode = res.statusCode || 0;
                        if (statusCode >= 300 && statusCode < 400) {
                            this.log.info(
                                `${this.name} - Detected redirection (${statusCode}) to ${res.headers.location}`,
                            );
                            // The location may be relative to the URL that answered
                            this.url = resolveUrl(this.url, res.headers.location as string);
                            // The answer of the redirect is not needed
                            this.closeIcyConnection();
                            connect();
                        } else {
                            resolve([this.url, res]);
                        }
                    });
                    this.icyConnection = request;
                    request.on('error', err => {
                        // An error of a request that was replaced (redirect) or closed is not ours any more
                        if (this.icyConnection !== request) {
                            return;
                        }
                        // the JS version forgot the call here
                        this.closeIcyConnection();
                        reject(new Error(String(err)));
                    });
                } catch (e) {
                    reject(new Error(String(e)));
                }
            };
            connect();
        });
    }

    private closeIcyConnection(): void {
        if (this.icyConnection) {
            try {
                this.icyConnection.abort();
            } catch {
                // ignore
            }
            this.icyConnection = undefined;
        }
    }

    private static getRequestOptions(theUrl: string): RequestOptions {
        // Some servers require a user agent (the Apache musicindex mod crashes without it)
        return { ...urlToHttpOptions(new URL(theUrl)), headers: { 'User-Agent': 'ChromecastPlayer' } };
    }

    private parseIcyHeaderPromise(baseUrl: string, res: icy.IcyResponse): Promise<MediaInfoItem[]> {
        // Example from http://edge.live.mp3.mdn.newmedia.nacamar.net/ps-dieneue_rock/livestream_hi.mp3:
        // {"content-type": "audio/mpeg", "icy-br": "128", "icy-description": "BESTER ROCK UND POP",
        //  "icy-genre": "Rock", "icy-name": "DIE NEUE 107.7", "icy-pub": "1", "icy-url": "http://www.dieneue1077.de",
        //  "server": "Icecast 2.3.3-kh11", "icy-metaint": "16000", ...}
        this.log.debug(`${this.name} - Connected to ${this.url}\n${inspect(res.headers, { depth: null })}`);

        // Remember the content type
        if ('content-type' in res.headers) {
            this.contentType = res.headers['content-type'];
        } else {
            this.contentType = lookup(this.url);
        }
        this.log.debug(`${this.name} - Detected ${this.contentType} as contentType`);

        // Check if this is a playlist
        let parser: PlaylistParser | undefined;
        if (this.contentType === 'audio/x-mpegurl' || this.contentType === 'application/x-mpegURL') {
            parser = M3U;
        } else if (this.contentType === 'audio/x-scpls') {
            parser = PLS;
        } else if (this.contentType === 'video/x-ms-asf' || this.contentType === 'video/x-ms-asx') {
            parser = ASX;
        }

        if (parser) {
            this.log.info(`${this.name} - Detected playlist -> parse`);
            return this.parsePlaylistPromise(baseUrl, res, parser);
        }

        if ('icy-name' in res.headers) {
            // Take the title from the ICY header
            this.addItem(this.url, this.contentType, { albumName: res.headers['icy-name'] as string });

            // Log the metadata events
            res.on('metadata', (metadata: Buffer) => this.gotMetadata(metadata));

            // Keep reading to get new metadata
            res.pipe(devNull());
        } else {
            // Not a playlist and we do not know how to parse it -> add it with some defaults
            this.addItem(this.url, this.contentType, { title: this.url });

            this.closeIcyConnection();
        }

        return Promise.resolve(this.items);
    }

    static validContentType(contentType: string | false | undefined): boolean {
        return !MIME_BLACKLIST.includes(contentType as string);
    }

    private addItem(url: string, contentType: string | false | undefined, metadata: CastMetadata): void {
        if (MediaInfo.validContentType(contentType)) {
            this.items.push({ url, contentType, metadata });
        } else {
            this.log.error(`${this.name} - Not supported type (${contentType}) for ${url}`);
        }
    }

    private updateMetadata(metadata: CastMetadata): void {
        this.items[0].metadata = Object.assign(this.items[0].metadata, metadata);
    }

    private parsePlaylistPromise(
        baseUrl: string,
        res: icy.IcyResponse,
        parser: PlaylistParser,
    ): Promise<MediaInfoItem[]> {
        return new Promise((resolve, reject) => {
            let body = '';
            res.on('data', (chunk: Buffer) => (body += chunk.toString()));

            res.on('end', () => {
                // Each element of the list gets a promise; they add their items directly to this.items
                const itemPromises: Promise<void>[] = [];

                // An HLS playlist (some servers send it as application/x-mpegURL) is one stream for the device: its
                // lines are segments or variants, not titles
                if (parser === M3U && body.includes('#EXT-X-')) {
                    this.log.info(`${this.name} - Detected HLS -> play as stream`);
                    this.addItem(this.url, this.contentType, { title: this.url });
                    this.icyConnection = undefined;
                    resolve(this.items);
                    return;
                }

                const playlist = parser.parse(body);
                for (const entry of playlist) {
                    // playlist-parser returns undefined for M3U lines it does not understand, and a PLS entry may
                    // have no file. castv2-player read entry.file anyway: an uncaught exception, the adapter crashed.
                    if (!entry?.file) {
                        continue;
                    }
                    const theUrl = resolveUrl(baseUrl, entry.file);
                    const title = entry.title ? entry.title : entry.file;
                    const artist = entry.artist ? entry.artist : 'unknown';

                    // Try to guess the content type from the extension
                    const contentType = lookup(theUrl);

                    if (contentType) {
                        this.addItem(theUrl, contentType, { title, artist });
                    } else {
                        // It did not work -> we need to access the URL directly (slower)
                        const itemMediaInfo = new MediaInfo(this.name, theUrl, this.log);
                        itemPromises.push(
                            itemMediaInfo
                                .getInfoPromise()
                                .then(itemList => {
                                    this.items = this.items.concat(itemList);
                                })
                                // castv2-player never closed it: a radio stream in a playlist was downloaded forever
                                .finally(() => itemMediaInfo.close()),
                        );
                    }
                }
                this.icyConnection = undefined;

                // When all promises are done, this.items is complete
                resolve(Promise.all(itemPromises).then(() => this.items));
            });

            res.on('error', err => {
                reject(err);
                this.icyConnection = undefined;
            });
        });
    }

    private gotMetadata(metadata: Buffer): void {
        // { StreamTitle: 'BILLY IDOL - WHITE WEDDING', StreamUrl: '&artist=BILLY%20IDOL&title=WHITE%20WEDDING&...' }
        const parsed = icy.parse(metadata);
        this.log.debug(`${this.name} - ICY got metadata: \n${inspect(parsed, { depth: null })}`);

        if (parsed.StreamTitle) {
            this.updateMetadata({ title: parsed.StreamTitle });
        }

        // Notify that the media has been updated
        this.emit(this.EVENT_UPDATE);
    }
}
