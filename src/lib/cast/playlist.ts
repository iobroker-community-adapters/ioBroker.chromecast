import type { CastPlayerStatus, CastQueueItem } from '../types';
import type { CastLogger } from './castLogger';
import { MediaInfo, type MediaInfoItem } from './mediaInfo';
import type { PersistentPlayer } from './persistentPlayer';

/** Playlists are included in status messages, which have to stay below 64K */
const MAX_PLAYLIST_SIZE = 50000;

/** Properties merged into each queue item, e.g. `{ startTime: 12 }` */
export type PlayOptions = Partial<CastQueueItem> & Record<string, unknown>;

/** The queue of the player: the items this adapter sent, replaced by the items the device reports */
export class Playlist {
    private mediaList: CastQueueItem[] = [];
    private mediaListById: Record<number, CastQueueItem> | undefined;
    private idToIndex: Record<number, number> | undefined;
    private readonly onPlayerStatus = (status?: CastPlayerStatus): void => this.gotPlayerStatus(status);

    constructor(
        private readonly name: string,
        private readonly player: PersistentPlayer,
        private readonly log: CastLogger,
    ) {
        player.on(player.EVENT_STATUS, this.onPlayerStatus);
    }

    /**
     * Stops following the status of the player. castv2-player never did: each played URL left its playlist behind,
     * which compared its list with every status (MaxListenersExceededWarning after 10 URLs, more memory and CPU).
     */
    destroy(): void {
        this.player.removeListener(this.player.EVENT_STATUS, this.onPlayerStatus);
    }

    /** Reads the URL (a media file, a stream or a playlist) and loads its items as the new queue of the device */
    addUrlPromise(url: string, options?: PlayOptions): Promise<void> {
        const mediaInfo = new MediaInfo(this.name, url, this.log);

        const playlistPromise = mediaInfo
            .getInfoPromise()
            .then(list => {
                mediaInfo.close();
                return this.addItems(list, options);
            })
            .catch(err => {
                mediaInfo.close();
                throw err;
            });

        return Promise.all([this.player.getDefaultPlayerPromise(), playlistPromise]).then(([player, list]) =>
            player.queueLoadPromise(list, { startIndex: 0, repeatMode: 'REPEAT_OFF' }),
        );
    }

    /** Reads the URL and adds its items to the local playlist (to insert them into the queue of the device) */
    insertPromise(url: string, options?: PlayOptions, disableCheck?: boolean): Promise<CastQueueItem[]> {
        const mediaInfo = new MediaInfo(this.name, url, this.log);

        return mediaInfo
            .getInfoPromise()
            .then(list => {
                mediaInfo.close();
                return this.addItems(list, options, disableCheck);
            })
            .catch(err => {
                mediaInfo.close();
                throw err;
            });
    }

    getAll(): CastQueueItem[] {
        return this.mediaList;
    }

    getItemWithId(itemId: number): CastQueueItem | undefined {
        return this.mediaListById?.[itemId];
    }

    getItemWithIndex(index: number): CastQueueItem | undefined {
        return this.mediaList[index];
    }

    getIndexForId(itemId: number): number | undefined {
        return this.idToIndex?.[itemId];
    }

    // disableCheck: the announcement may exceed the size limit
    private addItems(mediaInfo: MediaInfoItem[], options?: PlayOptions, disableCheck?: boolean): CastQueueItem[] {
        const addedItems: CastQueueItem[] = [];
        for (const info of mediaInfo) {
            let item: CastQueueItem = {
                autoplay: true,
                media: {
                    contentId: info.url,
                    metadata: {},
                },
            };
            if (info.contentType) {
                item.media!.contentType = info.contentType;
            }
            if (info.metadata) {
                item.media!.metadata = Object.assign(item.media!.metadata!, info.metadata);
            }
            if (options) {
                item = Object.assign(item, options);
            }

            this.mediaList.push(item);
            addedItems.push(item);

            if (disableCheck === undefined && JSON.stringify(this.mediaList).length > MAX_PLAYLIST_SIZE) {
                this.log.error(
                    `${this.name} - playlist too long(${mediaInfo.length}): stopping at ${this.mediaList.length} items`,
                );
                break;
            }
        }

        return addedItems;
    }

    private gotPlayerStatus(newStatus?: CastPlayerStatus): void {
        if (newStatus?.items && JSON.stringify(this.mediaList) !== JSON.stringify(newStatus.items)) {
            // Updated list
            this.mediaList = newStatus.items;
            this.mediaListById = {};
            this.idToIndex = {};
            for (let i = 0; i < this.mediaList.length; i++) {
                const itemId = this.mediaList[i].itemId as number;
                this.mediaListById[itemId] = this.mediaList[i];
                this.idToIndex[itemId] = i;
            }
        }
    }
}
