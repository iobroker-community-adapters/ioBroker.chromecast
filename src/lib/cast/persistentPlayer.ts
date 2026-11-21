import { EventEmitter } from 'node:events';
import { inspect } from 'node:util';
import { DefaultMediaReceiver, type Callback, type CastSession } from 'castv2-client';

import type { CastApplication, CastClientStatus, CastPlayerStatus, CastQueueItem } from '../types';
import type { CastLogger } from './castLogger';
import type { CastTimers } from './castTimers';
import type { PersistentClient } from './persistentClient';
import { Playlist, type PlayOptions } from './playlist';

/** Query the status if there was none in this time (ms) */
const STATUS_QUERY_TIME = 30000;

/** Announcement as JSON: `{ "url": "http://...", "volume": 40 }` */
interface AnnouncementOptions {
    url?: string;
    /** 0-100, only while the announcement plays */
    volume?: number;
}

/** Keeps the media player (the receiver app) of one device: joins the running app or launches the Default Media Receiver */
export class PersistentPlayer extends EventEmitter {
    readonly EVENT_CONNECTED = 'playerConnected';
    readonly EVENT_DISCONNECTED = 'playerDisconnected';
    readonly EVENT_PLAYING = 'playerPlaying';
    readonly EVENT_STOPPED = 'playerStopped';
    readonly EVENT_STATUS = 'playerStatus';

    private playlist: Playlist;
    private player: DefaultMediaReceiver | undefined;
    private currentApplicationId: string | undefined;
    private status: CastPlayerStatus | undefined;
    private previousStatus: CastPlayerStatus | undefined;
    private getStatusTimeout: ioBroker.Timeout | undefined;

    constructor(
        private readonly name: string,
        private readonly client: PersistentClient,
        private readonly log: CastLogger,
        private readonly timers: CastTimers,
    ) {
        super();

        // Register for client events
        client.on(client.EVENT_STATUS, (status: CastClientStatus) => this.clientStatus(status));
        client.on(client.EVENT_DISCONNECTED, () => this.clientDisconnected());

        this.playlist = new Playlist(name, this, log);
    }

    close(): void {
        this.detachPlayer();
    }

    /** Plays the URL (a media file, a stream or a playlist) as a new queue */
    playUrl(url: string, options?: PlayOptions): Promise<void> {
        this.log.info(`${this.name} - Try to play url - ${url}`);

        this.playlist.destroy();
        this.playlist = new Playlist(this.name, this, this.log);

        return this.playlist.addUrlPromise(url, options).catch(err => {
            this.log.error(`${this.name} - Error playing playlist - ${err.stack}`);
            throw err;
        });
    }

    pausePromise(): Promise<void> {
        return this.getConnectedPlayerPromise().then(player =>
            this.playerActionPromise('pause', cb => player.pause(cb)),
        );
    }

    playPromise(): Promise<CastPlayerStatus | undefined> {
        return this.getConnectedPlayerPromise()
            .then(player => this.playerActionPromise('play', cb => player.play(cb)))
            .then(() => this.getStatusPromise());
    }

    stopPromise(): Promise<CastPlayerStatus | undefined> {
        return this.getConnectedPlayerPromise()
            .then(player => this.playerActionPromise('stop', cb => player.stop(cb)))
            .then(() => this.getStatusPromise());
    }

    /**
     * Asks the device for the media status. Its answer only arrives as event "playerStatus" if the device broadcasts
     * it; the promise resolves with the cached status (or, with `wait`, with the next status event).
     */
    getStatusPromise(wait = false): Promise<CastPlayerStatus | undefined> {
        return this.getConnectedPlayerPromise()
            .then(player => this.playerActionPromise('getStatus', cb => player.getStatus(cb)))
            .then(() => {
                if (wait) {
                    return new Promise<CastPlayerStatus | undefined>(resolve =>
                        this.once(this.EVENT_STATUS, (status: CastPlayerStatus) => resolve(status)),
                    );
                }
                return this.getStatus();
            });
    }

    getStatus(): CastPlayerStatus | undefined {
        return this.status;
    }

    /** itemId of the item that plays */
    getCurrentPlaylistId(): number | undefined {
        // throws (like the JS version) without status
        return (this.status as CastPlayerStatus).currentItemId;
    }

    private updatePlaylistPromise(
        items: CastQueueItem[],
        options: Record<string, unknown> = {},
    ): Promise<CastPlayerStatus | undefined> {
        return this.getConnectedPlayerPromise()
            .then(player => this.playerActionPromise('queueUpdate', cb => player.queueUpdate(items, options, cb)))
            .then(() => this.getStatusPromise());
    }

    /** Inserts the items into the queue of the device; resolves with their new itemIds */
    private insertIntoPlaylistPromise(
        items: CastQueueItem[],
        options: { insertBefore?: number; currentItemIndex?: number; startTime?: number } = {},
    ): Promise<number[]> {
        // Find out the index of the new items
        const firstInsertionIndex = options.insertBefore
            ? (this.playlist.getIndexForId(options.insertBefore) as number)
            : // the items have been inserted already in the local playlist
              this.playlist.getAll().length - items.length;

        return this.getConnectedPlayerPromise()
            .then(player => this.playerActionPromise('queueInsert', cb => player.queueInsert(items, options, cb)))
            .then(() => this.getStatusPromise())
            .then(() => {
                // Calculate the itemIds of the inserted elements
                const itemIds: number[] = [];
                for (let i = firstInsertionIndex; i < firstInsertionIndex + items.length; i++) {
                    itemIds.push((this.playlist.getItemWithIndex(i) as CastQueueItem).itemId as number);
                }
                return itemIds;
            });
    }

    private removeFromPlaylistPromise(
        itemIds: number[],
        options: Record<string, unknown> = {},
    ): Promise<CastPlayerStatus | undefined> {
        return this.getConnectedPlayerPromise()
            .then(player => this.playerActionPromise('queueRemove', cb => player.queueRemove(itemIds, options, cb)))
            .then(() => this.getStatusPromise());
    }

    /** Jumps that many items in the queue (negative: back) */
    jumpInPlaylistPromise(jump: number): Promise<number> {
        return this.updatePlaylistPromise([], { jump }).then(() => jump);
    }

    /** REPEAT_OFF, REPEAT_ALL, REPEAT_SINGLE, REPEAT_ALL_AND_SHUFFLE */
    setRepeatModePromise(repeatMode: string): Promise<string> {
        return this.updatePlaylistPromise([], { repeatMode }).then(() => repeatMode);
    }

    /**
     * Plays an announcement now and resumes what played before.
     *
     * @param url URL, or JSON `{ "url": "...", "volume": 40 }` (as string or object)
     * @param options Options of the queue item
     */
    playAnnouncementPromise(url: string | AnnouncementOptions, options?: PlayOptions): Promise<unknown> {
        const passedUrl = typeof url === 'string' ? url : JSON.stringify(url);
        // Check if url is a JSON object
        let urlOptions: AnnouncementOptions | undefined = {};
        if (typeof url !== 'string' || url[0] === '{') {
            try {
                urlOptions = typeof url === 'string' ? (JSON.parse(url) as AnnouncementOptions) : url; // Assume object
                if (urlOptions.url === undefined) {
                    const error = 'json does not contain url field';
                    this.log.error(
                        `${this.name} - Error parsing announcement URL as JSON: ${error}\nPassed URL: ${passedUrl}`,
                    );
                    return Promise.reject(new Error(error));
                }
                url = urlOptions.url;
            } catch (error) {
                this.log.error(
                    `${this.name} - Error parsing announcement URL as JSON: ${error}\nPassed URL: ${passedUrl}`,
                );
                return Promise.reject(error as Error);
            }
        }
        const announcementUrl = url;

        return this.getDefaultPlayerPromise().then(() => {
            if (
                this.getStatus() === undefined ||
                this.getCurrentPlaylistId() === undefined ||
                this.getStatus()!.playerState === 'IDLE'
            ) {
                // currently not playing -> playUrl and wait for it to finish
                this.log.info(`${this.name} - Try to play announcement - ${JSON.stringify(announcementUrl)}`);

                // Set the volume if required
                const currentVolume = this.client.getVolume();
                if (urlOptions?.volume) {
                    void this.client.setVolumePromise(urlOptions.volume);
                }

                return this.playUrl(announcementUrl, options).then(
                    playUrlResult =>
                        new Promise(resolve => {
                            const announcementCheckStatus = (status: CastPlayerStatus): void => {
                                if (status.media!.contentId !== announcementUrl || status.playerState !== 'PLAYING') {
                                    this.log.info(`${this.name} - Finished playing announcement`);
                                    this.removeListener(this.EVENT_STATUS, announcementCheckStatus);
                                    // Reset the original volume if required
                                    if (urlOptions?.volume) {
                                        void this.client.setVolumePromise(currentVolume);
                                    }
                                    resolve(playUrlResult);
                                }
                            };
                            this.on(this.EVENT_STATUS, announcementCheckStatus);
                        }),
                );
            }

            // Currently playing -> insert the announcement and wait for it to finish
            this.log.info(`${this.name} - Try to play announcement - ${JSON.stringify(announcementUrl)}`);

            let chunkItemIds: number[] = [];

            // Remember the current track position
            const status = this.getStatus()!;
            const currentTime = status.currentTime;
            const currentVolume = this.client.getVolume();
            const currentURL = status.media!.contentId as string;
            const currentDuration = status.media!.duration;

            // Objective: current -> announcement -> remaining current (if not streaming) -> (nextItem)
            const playingStreaming = !((currentDuration as number) > 0);

            // Calculate the next track: in streaming we come back to the current item (its itemId)
            let nextItem: CastQueueItem | number | undefined;
            if (playingStreaming) {
                nextItem = this.getCurrentPlaylistId();
            } else {
                const nextItemIndex = (this.playlist.getIndexForId(this.getCurrentPlaylistId()!) as number) + 1;
                nextItem = this.playlist.getItemWithIndex(nextItemIndex);
            }

            // If we are not streaming, we add the current track again with the start set to the current location
            let remainingPromise: Promise<number[]> = Promise.resolve([]);
            if (!playingStreaming) {
                // First we add it locally
                remainingPromise = this.playlist
                    .insertPromise(currentURL, { startTime: currentTime }, true)
                    .then(items => {
                        // Second: send it to the Chromecast
                        const optionsResume: { startTime?: number; insertBefore?: number } = {};
                        if (currentDuration && currentTime && currentTime <= currentDuration) {
                            optionsResume.startTime = currentTime;
                        }
                        if (nextItem) {
                            optionsResume.insertBefore = (nextItem as CastQueueItem).itemId;
                        }

                        return this.insertIntoPlaylistPromise(items, optionsResume);
                    });
            }

            return remainingPromise
                .then(itemIds => {
                    // Remember that we have to delete the chunk (if we are not streaming)
                    chunkItemIds = itemIds;

                    // Now we can insert the actual announcement. First locally.
                    return this.playlist.insertPromise(announcementUrl, options, true);
                })
                .then(items => {
                    // Insert into the playlist and start playing
                    const optionsAnnouncement = {
                        currentItemIndex: 0,
                        insertBefore: playingStreaming ? this.getCurrentPlaylistId() : chunkItemIds[0],
                    };

                    // Second: send it to the Chromecast
                    return this.insertIntoPlaylistPromise(items, optionsAnnouncement);
                })
                .then(insertedIds => {
                    let announcementIds = insertedIds;

                    // Set the volume if required - here to avoid a peak in the volume with the track that plays
                    if (urlOptions?.volume) {
                        void this.client.setVolumePromise(urlOptions.volume);
                    }

                    // Wait for the remaining current item to start playing, then remove the announcement and resume
                    // the volume
                    return new Promise(resolve => {
                        // Called on every status update
                        const resumeAfterAnnouncement = (): void => {
                            if (
                                announcementIds.length > 0 &&
                                !announcementIds.includes(this.getCurrentPlaylistId() as number)
                            ) {
                                // The item after the announcement started buffering -> restore the original volume
                                if (urlOptions?.volume) {
                                    void this.client.setVolumePromise(currentVolume);
                                    // So we do not set it again on every status update
                                    urlOptions = undefined;
                                }

                                if (this.getStatus()!.playerState !== 'BUFFERING') {
                                    // The item after the announcement started playing -> remove the announcement
                                    this.log.info(`${this.name} - Resumed after announcement`);
                                    void this.removeFromPlaylistPromise(announcementIds);
                                    announcementIds = [];
                                    // Announcement ended
                                    resolve(announcementUrl);
                                    return;
                                }
                            }

                            if (
                                // Announcement already completed
                                announcementIds.length === 0 &&
                                // Did we insert a chunk? Or did the next item start playing?
                                (chunkItemIds.length === 0 ||
                                    (typeof nextItem === 'object' &&
                                        this.getCurrentPlaylistId() === nextItem.itemId &&
                                        this.getStatus()!.playerState !== 'BUFFERING'))
                            ) {
                                // The remaining current item we inserted started playing -> remove it
                                this.log.info(`${this.name} - Back to regular playlist`);
                                if (chunkItemIds.length > 0) {
                                    void this.removeFromPlaylistPromise(chunkItemIds);
                                }

                                // We are done
                                this.removeListener(this.EVENT_STATUS, resumeAfterAnnouncement);
                                return;
                            }

                            // Sanity check - if all items disappeared, a new playlist was loaded.
                            // The JS version had its "break" outside the "if", so only the first ID is checked.
                            const idsToCheck = announcementIds.concat(chunkItemIds);
                            const allGone =
                                idsToCheck.length === 0 || this.playlist.getItemWithId(idsToCheck[0]) === undefined;
                            if (allGone) {
                                this.log.warn(
                                    `${this.name} - remaining item to play after announcement not found in the playlist -> remove status handled`,
                                );
                                this.removeListener(this.EVENT_STATUS, resumeAfterAnnouncement);
                                this.log.debug(
                                    `${this.name} - Player status:\n${inspect(this.status, { depth: null })}`,
                                );
                            }

                            // Not the status update we are waiting for
                        };

                        this.on(this.EVENT_STATUS, resumeAfterAnnouncement);
                    });
                });
        });
    }

    /** Launches the Default Media Receiver if it does not run yet */
    getDefaultPlayerPromise(): Promise<this> {
        // Is the DefaultMediaReceiver already loaded?
        if (this.player && this.currentApplicationId === DefaultMediaReceiver.APP_ID) {
            return Promise.resolve(this);
        }

        // detach and launch the DefaultMediaReceiver
        this.detachPlayer();

        this.log.info(`${this.name} - Try to launch default player`);
        return this.client.launchPromise(DefaultMediaReceiver).then(p => {
            this.currentApplicationId = DefaultMediaReceiver.APP_ID;

            this.playerConnected(p);
            this.log.info(`${this.name} - Default player lauched`);

            return this;
        });
    }

    /** Loads the items as the new queue of the device */
    queueLoadPromise(list: CastQueueItem[], options: Record<string, unknown>): Promise<void> {
        return this.getDefaultPlayerPromise().then(
            () =>
                new Promise<void>((resolve, reject) => {
                    const errorCallback = (err?: Error): void => reject(err || new Error('Unexpected close'));

                    this.log.info(`${this.name} - Try to play playlist with ${list.length} items`);
                    this.player!.queueLoad(list, options, (err, status) => {
                        if (err) {
                            errorCallback(err);
                        } else {
                            this.log.info(`${this.name} - Playing playlist with ${list.length} items`);
                            this.playerStatus(status as CastPlayerStatus);
                            resolve();
                            this.removeListener(this.EVENT_DISCONNECTED, errorCallback);
                        }
                    });

                    this.once(this.EVENT_DISCONNECTED, errorCallback);
                }),
        );
    }

    private clientStatus(status: CastClientStatus): void {
        // If the Chromecast has an application running, try to attach the DefaultMediaReceiver.
        // NOTE: this might fail in case the Chromecast is running a weird player.
        //       It works fine with the TuneIn and Plex applications.
        const application: CastApplication | undefined = status.applications?.[0];
        if (application !== undefined) {
            const currentApplicationId = application.appId;

            if (!('namespaces' in application) || currentApplicationId === 'MultizoneLeader') {
                // We cannot connect to the MultizoneLeader since it has neither namespaces nor transportId:
                // {"applications":[{"appId":"MultizoneLeader", "displayName":"Default Media Receiver",
                //   "isIdleScreen":false, "sessionId":"63533C2D-...", "statusText":"Now Casting: http://..."}],
                //  "volume":{"controlType":"attenuation", "level":0.17, "muted":false, "stepInterval":0.05}}
                this.detachPlayer();
            } else if (this.player === undefined || this.currentApplicationId !== currentApplicationId) {
                // Updated APP ID -> re-attach
                this.currentApplicationId = currentApplicationId;
                this.joinPlayer(application);
            }
            this.currentApplicationId = currentApplicationId;
        } else {
            this.currentApplicationId = undefined;
            this.detachPlayer();
        }
    }

    private clientDisconnected(): void {
        this.log.info(`${this.name} - client disconnected`);
        this.detachPlayer();
    }

    private joinPlayer(application: CastApplication): void {
        this.log.info(`${this.name} - Try to join player`);

        this.detachPlayer();

        this.client
            .joinPromise(application as CastSession, DefaultMediaReceiver)
            .then(p => {
                this.playerConnected(p);
                this.log.info(`${this.name} - Player joint`);
            })
            .catch(err => this.log.error(`${this.name} - Failed to attach player: ${err}`));
    }

    private detachPlayer(): void {
        const player = this.player;
        if (player) {
            // Cleared first: close() emits "close", which calls detachPlayer() again (castv2-player then logged
            // "Detached player" and emitted the events twice)
            this.player = undefined;

            if (this.getStatusTimeout) {
                this.timers.clearTimeout(this.getStatusTimeout);
            }

            // Try to close in case we triggered the close
            try {
                player.close();
            } catch {
                // ignore
            }

            this.log.info(`${this.name} - Detached player`);
            this.status = undefined;

            this.emit(this.EVENT_DISCONNECTED);
            this.emit(this.EVENT_STOPPED);
        }
    }

    /** Registers for the events of a new player connection */
    private playerConnected(p: DefaultMediaReceiver): void {
        this.log.info(`${this.name} - Connected player`);

        // We attached fine -> remember the player
        this.player = p;

        p.on('close', () => this.detachPlayer());
        p.on('error', (err: Error) => {
            this.log.error(`${this.name} - Player - ${err}`);
            this.detachPlayer();
        });

        // Handle player status updates
        const getStatusHandler: Callback = (err, pStatus) => {
            if (err) {
                this.log.error(`${this.name} - Could not get player status- ${err}`);
            } else {
                this.playerStatus(pStatus as CastPlayerStatus);
            }
        };
        p.on('status', (status: CastPlayerStatus) => this.playerStatus(status));
        // Trigger one now
        p.getStatus(getStatusHandler);
        // Query the status if not queried in the last STATUS_QUERY_TIME ms
        if (this.getStatusTimeout) {
            this.timers.clearTimeout(this.getStatusTimeout);
        }
        this.getStatusTimeout = this.timers.setTimeout(() => p.getStatus(getStatusHandler), STATUS_QUERY_TIME);

        this.emit(this.EVENT_CONNECTED);
    }

    private playerStatus(status: CastPlayerStatus): void {
        // Cache the player status
        this.previousStatus = this.status ? JSON.parse(JSON.stringify(this.status)) : undefined;
        this.status = this.status ? Object.assign(this.status, status) : status;

        this.emit(this.EVENT_STATUS, this.status, this.previousStatus);
        if (
            this.status &&
            this.status.playerState === 'PLAYING' &&
            (this.previousStatus === undefined || this.status.playerState !== this.previousStatus.playerState)
        ) {
            if (this.status.media) {
                this.emit(this.EVENT_PLAYING, this.status.media.contentId);
                this.log.info(`${this.name} - Playing - ${this.status.media.contentId}`);
            } else {
                this.log.info(`${this.name} - Playing - unknown media`);
            }
        }
    }

    private getConnectedPlayerPromise(): Promise<DefaultMediaReceiver> {
        if (this.player) {
            return Promise.resolve(this.player);
        }

        return new Promise((resolve, reject) => {
            // eslint-disable-next-line prefer-const -- the listener clears it, the timeout removes the listener
            let timeout: ioBroker.Timeout | undefined;
            const listenerCallback = (): void => {
                // Received the connected event
                this.timers.clearTimeout(timeout);
                resolve(this.player as DefaultMediaReceiver);
            };
            this.once(this.EVENT_CONNECTED, listenerCallback);
            timeout = this.timers.setTimeout(() => {
                this.removeListener(this.EVENT_CONNECTED, listenerCallback);
                reject(new Error('Could not connect after 10 seconds'));
            }, 10000);
        });
    }

    private playerActionPromise(actionName: string, playerAction: (callback: Callback) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            playerAction(err => {
                if (err) {
                    this.log.warn(`${this.name} - Rejected ${actionName} - ${err}`);
                    reject(err);
                } else {
                    this.log.info(`${this.name} - ${actionName}`);
                    resolve();
                }
            });
        });
    }
}
