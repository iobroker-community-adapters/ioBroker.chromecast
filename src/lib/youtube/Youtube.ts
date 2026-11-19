// Shamelessly copied from https://github.com/alxhotel/chromecast-api

import { Application, MediaController, type Callback, type CastSession } from 'castv2-client';
import { createYoutubeController, type YoutubeController } from './YoutubeController';

// The regex contains invisible characters (copied from the original); kept 1:1, only the first group is used
const YOUTUBE_REGEX =
    // eslint-disable-next-line no-irregular-whitespace, no-useless-escape
    /(?:http(?:s?):\/\/)?(?:www\.)?(?:music\.)?youtu(?:be\.com\/watch\?v=|\.be\/)([\w\-\_]*)(&(amp;)?‌​[\w\?‌​=]*)?/;
const URI_REGEX = /\w+:(\/?\/?)[^\s]+/;
const PATH_REGEX = /(\\\\?([^\\/]*[\\/])*)([^\\/]+)/;

export default class Youtube extends Application {
    private readonly media: MediaController;
    private readonly youtube: YoutubeController;

    constructor(client: unknown, session: CastSession) {
        super(client, session);

        this.media = this.createController(MediaController);
        this.youtube = this.createController(createYoutubeController);

        this.media.on('status', (status: unknown) => {
            this.emit('status', status);
        });
    }

    static get APP_ID(): string {
        return '233637DE';
    }

    static getYoutubeId(obj: unknown): string | null {
        if (!obj || typeof obj !== 'string') {
            return null;
        }

        const youtubeMatch = obj.match(YOUTUBE_REGEX);
        const uriMatch = obj.match(URI_REGEX);
        const pathMatch = obj.match(PATH_REGEX);

        if (youtubeMatch && youtubeMatch.length > 1) {
            // Extract the video id
            return youtubeMatch[1];
        }
        if ((uriMatch && uriMatch.length > 1) || (pathMatch && pathMatch.length > 1)) {
            // URI or path to file
            return null;
        }
        // Looks like a possible video id (lets try)
        return obj;
    }

    getStatus(callback: Callback): void {
        this.media.getStatus(callback);
    }

    load(videoId: string, callback?: Callback): void {
        this.youtube.load(videoId, callback);
    }

    play(callback?: Callback): void {
        this.media.play(callback);
    }

    pause(callback?: Callback): void {
        this.media.pause(callback);
    }

    stop(callback?: Callback): void {
        this.media.stop(callback);
    }

    seek(currentTime: number, callback?: Callback): void {
        this.media.seek(currentTime, callback);
    }
}
