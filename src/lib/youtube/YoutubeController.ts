// Shamelessly copied from https://github.com/alxhotel/chromecast-api

import { RequestResponseController } from 'castv2-client';
import YoutubeRemote from 'youtube-remote';

const YOUTUBE_URN = 'urn:x-cast:com.google.youtube.mdx';

type Callback = (err: Error | null, result?: unknown) => void;

/** Answer of the YouTube receiver app on the MDX channel */
interface MdxMessage {
    type?: string;
    reason?: string;
    data?: { screenId?: string };
}

function noop(): void {}

export class YoutubeController extends RequestResponseController {
    private screenId: string | null = null;
    private remote: YoutubeRemote | null = null;

    constructor(client: unknown, sourceId: string, destinationId: string) {
        super(client, sourceId, destinationId, YOUTUBE_URN);
        // The original (chromecast-api) called this.stop() on "close", which does not exist on a controller and threw
        // an uncaught TypeError when the connection to the device closed. There is nothing to stop.
    }

    load(videoId: string, callback?: Callback): void {
        const cb = callback || noop;

        this.playVideo(videoId, (err, res) => {
            if (err) {
                return cb(err);
            }
            cb(null, res);
        });
    }

    playVideo(videoId: string, listId?: string | Callback, callback?: Callback): void {
        let list = listId;
        let cb = callback;
        if (typeof list === 'function') {
            cb = list;
            list = '';
        }
        const done = cb || noop;

        this.getScreenId((err, screenId) => {
            if (err) {
                return done(err);
            }

            this.remote = new YoutubeRemote(screenId as string);
            this.remote.playVideo(videoId, list || '', done as (err?: Error | null, result?: unknown) => void);
        });
    }

    addToQueue(videoId: string): void {
        this.remote?.addToQueue(videoId);
    }

    playNext(videoId: string): void {
        this.remote?.playNext(videoId);
    }

    removeVideo(videoId: string): void {
        this.remote?.removeVideo(videoId);
    }

    clearPlaylist(): void {
        this.remote?.clearPlaylist();
    }

    private getScreenId(callback?: Callback): void {
        const cb = callback || noop;

        this.controlRequest({ type: 'getMdxSessionStatus' }, (err, body) => {
            if (err) {
                return cb(err);
            }

            const screenId = body?.data?.screenId;
            if (!screenId) {
                return cb(new Error('Failed to fetch screen ID'));
            }
            this.screenId = screenId;

            cb(null, this.screenId);
        });
    }

    private controlRequest(
        data: Record<string, unknown>,
        callback: (err: Error | null, response?: MdxMessage) => void,
    ): void {
        const onMessage = (response: MdxMessage): void => {
            this.removeListener('message', onMessage);

            if (response.type === 'INVALID_REQUEST') {
                return callback(new Error(`Invalid request: ${response.reason}`));
            }

            callback(null, response);
        };

        this.on('message', onMessage);

        this.send(data);
    }
}

/**
 * Factory for Sender.createController(): castv2-client calls the controller constructor ES5 style (without `new`),
 * which an ES class does not allow. Returning the instance from a plain function works with that.
 */
export function createYoutubeController(client: unknown, sourceId: string, destinationId: string): YoutubeController {
    return new YoutubeController(client, sourceId, destinationId);
}
