// Minimal typings for castv2-player (CommonJS, no own typings). Only what this adapter uses.
declare module 'castv2-player' {
    import type { EventEmitter } from 'node:events';
    import type { ApplicationClass, CastSession } from 'castv2-client';

    /** Logger with printf-like formatting, as used by castv2-player internally */
    export interface CastLogger {
        error(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        info(...args: unknown[]): void;
        debug(...args: unknown[]): void;
    }

    /** Wraps a plain logger (e.g. adapter.log) and formats the printf-like arguments of castv2-player */
    export class LogWrapper implements CastLogger {
        constructor(logger: {
            error(msg: string): void;
            warn(msg: string): void;
            info(msg: string): void;
            debug(msg: string): void;
        });
        error(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        info(...args: unknown[]): void;
        debug(...args: unknown[]): void;
    }

    /** A device found by the scanner (or emulated for manually added devices) */
    export interface CastConnection {
        /** mDNS id of the device (txt field "id") */
        id: string;
        /** Friendly name of the device */
        name: string;
        host: string;
        port: number | string;
        /** 'Chromecast', 'Chromecast Audio', 'Google Cast Group', ... */
        type: string;
        registerForUpdates(callback: (connection: CastConnection) => void): void;
    }

    export type RepeatMode = 'REPEAT_OFF' | 'REPEAT_ALL' | 'REPEAT_SINGLE' | 'REPEAT_ALL_AND_SHUFFLE';

    /** The castv2-client platform sender that persistentClient keeps internally */
    export interface CastPlatformClient {
        getSessions(callback: (err: Error | null, sessions: CastSession[]) => void): void;
        join<T>(session: CastSession, app: ApplicationClass<T>, callback: (err: Error | null, app?: T) => void): void;
        launch<T>(app: ApplicationClass<T>, callback: (err: Error | null, app?: T) => void): void;
    }

    export interface CastMediaPlayer extends EventEmitter {
        readonly EVENT_CONNECTION: 'connection';
        readonly EVENT_CLIENT_STATUS: 'clientStatus';
        readonly EVENT_CLIENT_CONNECTED: 'clientConnected';
        readonly EVENT_CLIENT_DISCONNECTED: 'clientDisconnected';
        readonly EVENT_PLAYER_STATUS: 'playerStatus';
        readonly EVENT_PLAYER_PLAYING: 'playerPlaying';
        readonly EVENT_PLAYER_STOPPED: 'playerStopped';

        /** Private in castv2-player, but used for launching the YouTube app: `_client._client` is the castv2-client */
        _client: { _client?: CastPlatformClient };

        playUrlPromise(url: string, options?: Record<string, unknown>): Promise<unknown>;
        playAnnouncementPromise(url: string, options?: Record<string, unknown>): Promise<unknown>;
        close(): void;

        /** Volume 0-100 from the cached client status */
        getVolume(): number;
        /**
         * Should return the mute flag, but castv2-player reads `.muted` from the number that getVolume() returns,
         * so it is always `undefined`.
         */
        isMuted(): boolean | undefined;
        setVolumePromise(volume: number): Promise<unknown>;
        mutePromise(): Promise<unknown>;
        unmutePromise(): Promise<unknown>;

        pausePromise(): Promise<unknown>;
        playPromise(): Promise<unknown>;
        stopPromise(): Promise<unknown>;
        getStatusPromise(): Promise<unknown>;
        jumpInPlaylistPromise(jump: number): Promise<unknown>;
        setRepeatModePromise(repeatMode: RepeatMode): Promise<unknown>;

        /** Private in castv2-player: takes over a changed host/port from the scanner */
        _updateDevice(connection: CastConnection): void;
    }

    export type CastMediaPlayerClass = new (connection: CastConnection) => CastMediaPlayer;

    export interface ScannerOptions {
        /** How often to trigger a discovery in ms. Default: every 10 minutes */
        scanInterval?: number;
        /** Only return devices with this name */
        name?: string;
        /** Max number of devices to find */
        maxMatches?: number;
    }

    export interface CastScanner {
        destroy(): void;
    }

    export type CastScannerClass = new (
        onNewDevice: (connection: CastConnection) => void,
        options?: ScannerOptions,
    ) => CastScanner;

    /** Factory: returns the MediaPlayer class bound to the given logger */
    export function MediaPlayer(logger?: CastLogger): CastMediaPlayerClass;

    /** Factory: returns the mDNS Scanner class bound to the given logger */
    export function Scanner(logger?: CastLogger): CastScannerClass;
}
