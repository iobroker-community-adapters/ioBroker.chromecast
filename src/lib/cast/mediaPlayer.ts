import { EventEmitter } from 'node:events';
import type { Client } from 'castv2-client';

import type { CastLogger } from './castLogger';
import { PersistentClient, type CastAddress } from './persistentClient';
import { PersistentPlayer } from './persistentPlayer';
import type { PlayOptions } from './playlist';

/** A device found by the scanner (or emulated for a device added by hand) */
export interface CastConnection extends CastAddress {
    /** mDNS id of the device (TXT field "id") */
    id: string;
    /** 'Chromecast', 'Chromecast Audio', 'Google Cast Group', ... */
    type: string;
    /** The scanner calls the (last) registered callback whenever it sees the device again */
    registerForUpdates(callback: (connection: CastConnection) => void): void;
}

export type RepeatMode = 'REPEAT_OFF' | 'REPEAT_ALL' | 'REPEAT_SINGLE' | 'REPEAT_ALL_AND_SHUFFLE';

/** One Cast device: the connection to its receiver (client) and the media player app (player) */
export class MediaPlayer extends EventEmitter {
    readonly EVENT_CONNECTION = 'connection';
    readonly EVENT_CLIENT_STATUS = 'clientStatus';
    readonly EVENT_CLIENT_CONNECTED = 'clientConnected';
    readonly EVENT_CLIENT_DISCONNECTED = 'clientDisconnected';
    readonly EVENT_PLAYER_STATUS = 'playerStatus';
    readonly EVENT_PLAYER_PLAYING = 'playerPlaying';
    readonly EVENT_PLAYER_STOPPED = 'playerStopped';

    private readonly client: PersistentClient;
    private readonly player: PersistentPlayer;
    /** The connection the scanner reported last */
    device: CastConnection | undefined;

    constructor(
        readonly connection: CastConnection,
        log: CastLogger,
    ) {
        super();

        log.debug(`New device ${connection.name} at ${connection.host}:${connection.port}`);

        // Register for updates
        connection.registerForUpdates(device => this.updateDevice(device));

        this.client = new PersistentClient(connection, log);

        // Forward some client events
        this.client.on(this.client.EVENT_STATUS, (...args: unknown[]) => this.emit(this.EVENT_CLIENT_STATUS, ...args));
        this.client.on(this.client.EVENT_CONNECTED, (...args: unknown[]) =>
            this.emit(this.EVENT_CLIENT_CONNECTED, ...args),
        );
        this.client.on(this.client.EVENT_DISCONNECTED, (...args: unknown[]) =>
            this.emit(this.EVENT_CLIENT_DISCONNECTED, ...args),
        );

        this.player = new PersistentPlayer(connection.name, this.client, log);

        // Forward some player events
        this.player.on(this.player.EVENT_STATUS, (...args: unknown[]) => this.emit(this.EVENT_PLAYER_STATUS, ...args));
        this.player.on(this.player.EVENT_PLAYING, (...args: unknown[]) =>
            this.emit(this.EVENT_PLAYER_PLAYING, ...args),
        );
        this.player.on(this.player.EVENT_STOPPED, (...args: unknown[]) =>
            this.emit(this.EVENT_PLAYER_STOPPED, ...args),
        );
    }

    /** The connected castv2-client (to launch other receiver apps, e.g. YouTube) */
    get castClient(): Client | undefined {
        return this.client.castClient;
    }

    /** Plays the URL (a media file, a stream or a playlist) as a new queue */
    playUrlPromise(url: string, options?: PlayOptions): Promise<void> {
        return this.player.playUrl(url, options);
    }

    close(): void {
        this.player.close();
        this.client.close();
    }

    // CLIENT ACTIONS

    /** Volume 0-100 from the cached receiver status */
    getVolume(): number {
        return this.client.getVolume();
    }

    /**
     * Should be the mute flag, but castv2-player read `.muted` from the number that getVolume() returns, so it was
     * always `undefined`. Kept as it was.
     */
    isMuted(): boolean | undefined {
        return undefined;
    }

    setVolumePromise(volume: number): Promise<number> {
        return this.client.setVolumePromise(volume);
    }

    mutePromise(): Promise<number> {
        return this.client.mutePromise();
    }

    unmutePromise(): Promise<number> {
        return this.client.unmutePromise();
    }

    // PLAYER ACTIONS

    pausePromise(): Promise<void> {
        return this.player.pausePromise();
    }

    playPromise(): Promise<unknown> {
        return this.player.playPromise();
    }

    stopPromise(): Promise<unknown> {
        return this.player.stopPromise();
    }

    getStatusPromise(): Promise<unknown> {
        return this.player.getStatusPromise();
    }

    // PLAYLIST ACTIONS

    /** Jumps that many items in the queue (negative: back) */
    jumpInPlaylistPromise(jump: number): Promise<number> {
        return this.player.jumpInPlaylistPromise(jump);
    }

    setRepeatModePromise(repeatMode: RepeatMode): Promise<string> {
        return this.player.setRepeatModePromise(repeatMode);
    }

    /** Plays the announcement (URL or JSON `{ url, volume }`) now and resumes what played before */
    playAnnouncementPromise(url: string, options?: PlayOptions): Promise<unknown> {
        return this.player.playAnnouncementPromise(url, options);
    }

    /** Takes over a changed address from the scanner (reconnects if needed) */
    updateDevice(device: CastConnection): void {
        this.device = device;

        this.client.updateDevice(device);

        this.emit(this.EVENT_CONNECTION, device);
    }
}
