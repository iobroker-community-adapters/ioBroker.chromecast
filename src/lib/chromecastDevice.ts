import { readFileSync } from 'node:fs';
import { getMAC } from 'node-arp';
import type { AdapterInstance } from '@iobroker/adapter-core';
import type { CastConnection, CastMediaPlayer, CastMediaPlayerClass, RepeatMode } from 'castv2-player';
import type { ApplicationClass } from 'castv2-client';

import Youtube from './youtube/Youtube';
import type { CastClientStatus, CastPlayerStatus } from './types';

const REPEAT_MODE = {
    NONE: 0,
    ALL: 1,
    ONE: 2,
} as const;

const PLAYER_STATE = {
    PAUSE: 0,
    PLAY: 1,
    STOP: 2,
} as const;

type NewState = { val: ioBroker.StateValue | undefined; ack: boolean };

function getMac(ip: string): Promise<string> {
    return new Promise((resolve, reject) =>
        // node-arp reports errors as (true, message)
        getMAC(ip, (err, mac) => (err ? reject(new Error(String(mac))) : resolve(String(mac)))),
    );
}

/** What all devices of one adapter instance share */
export interface ChromecastDeviceContext {
    adapter: AdapterInstance;
    /** MediaPlayer class of castv2-player bound to the logger of the adapter */
    MediaPlayer: CastMediaPlayerClass;
    /** Port of the configured web instance (8082 if none) */
    webPort: number;
    /** IDs of all devices of this instance, to detect duplicates */
    knownDeviceIds: string[];
}

/** One Cast device (or speaker group): its states below `<namespace>.<id>` and the castv2-player MediaPlayer */
export class ChromecastDevice {
    private readonly adapter: AdapterInstance;
    private readonly MediaPlayer: CastMediaPlayerClass;
    private readonly webPort: number;
    private readonly knownDeviceIds: string[];

    private shuffle = false;
    /** false until the first status arrives, then one of REPEAT_MODE */
    private repeat: number | boolean = false;

    private readonly connection: CastConnection;
    /** Name of the device with dots and whitespaces replaced by "_" */
    private readonly name: string;
    private readonly isManuallyAddedDevice: boolean;
    /** ID below the adapter namespace: MAC address without ":", groups.<id> or the name from the settings */
    private id = '';
    private mediaPlayer: CastMediaPlayer | undefined;

    private readonly stateChangeHandler = (id: string, state: ioBroker.State | null | undefined): void => {
        this.onStateChange(id, state).catch(e => this.adapter.log.error(`${this.name} - ${e}`));
    };

    constructor(context: ChromecastDeviceContext, connection: CastConnection, isManuallyAddedDevice: boolean) {
        this.adapter = context.adapter;
        this.MediaPlayer = context.MediaPlayer;
        this.webPort = context.webPort;
        this.knownDeviceIds = context.knownDeviceIds;

        this.connection = connection;
        this.name = connection.name.replace(/[.\s]+/g, '_');

        this.isManuallyAddedDevice = isManuallyAddedDevice;

        this.main().catch(e => this.adapter.log.error(`${this.name} - ${e}`));
    }

    private async main(): Promise<void> {
        let id: string;
        if (this.connection.type === 'Google Cast Group') {
            id = `groups.${this.connection.id.replace(/-/g, '')}`;
        } else if (this.isManuallyAddedDevice) {
            // Device was manually added to the adapter config tab "devices" => the name defined there is used.
            // For compatibility to version 3.0.3: replace whitespaces and dots with an underscore,
            // to avoid problems with identifiers, remove forbidden characters
            id = this.connection.name.replace(/[.\s]+/g, '_').replace(this.adapter.FORBIDDEN_CHARS, '');
        } else {
            // Device was not added manually, but was automatically detected => MAC address is used as name
            try {
                id = (await getMac(this.connection.host)).replaceAll(':', '');
            } catch (e) {
                this.adapter.log.error(`${this.name} - Cannot get MAC for "${this.connection.host}": ${e.toString()}`);
                // The JS version went on with an undefined id, so such a device ends up below "<namespace>.undefined".
                // Kept as it was.
                id = 'undefined';
            }
        }

        // check if the id is a duplicate
        if (this.knownDeviceIds.includes(id)) {
            this.adapter.log.error(`${id} is not unique, please fix configuration!`);
            return;
        }
        this.knownDeviceIds.push(id);
        this.id = id;

        // Create ioBroker states
        await this.createObjects();

        // MEDIA PLAYER
        await this.initMediaPlayer();

        // IOBROKER
        // reset status of player states
        await this.updatePlayerStatus({});

        // Register for updates coming from ioBroker
        this.adapter.on('stateChange', this.stateChangeHandler);

        // Register for updates coming from network scanner
        this.connection.registerForUpdates(connection => this.networkScannerChange(connection));
    }

    // Media player
    private async initMediaPlayer(): Promise<void> {
        if (this.mediaPlayer) {
            this.mediaPlayer.close();
            this.mediaPlayer = undefined;
        }

        let state: ioBroker.State | null | undefined;
        try {
            state = await this.adapter.getStateAsync(`${this.id}.enabled`);
        } catch {
            // ignore
        }

        if (state && !state.val) {
            this.adapter.log.info(`${this.name} - not enabled`);
        } else {
            // Create media player
            const mediaPlayer = new this.MediaPlayer(this.connection);
            this.mediaPlayer = mediaPlayer;

            const onError = (e: Error): void => this.adapter.log.error(`${this.name} - ${e}`);

            // register for mediaPlayer updates
            // client
            mediaPlayer.on(mediaPlayer.EVENT_CLIENT_STATUS, (status: CastClientStatus) =>
                this.updateClientStatus(status).catch(onError),
            );
            mediaPlayer.on(mediaPlayer.EVENT_CLIENT_CONNECTED, () => this.connectedMediaPlayer().catch(onError));
            mediaPlayer.on(mediaPlayer.EVENT_CLIENT_DISCONNECTED, () => this.disconnectedMediaPlayer().catch(onError));
            // player
            mediaPlayer.on(
                mediaPlayer.EVENT_PLAYER_STATUS,
                (status: CastPlayerStatus, previousStatus?: CastPlayerStatus) =>
                    this.updatePlayerStatus(status, previousStatus).catch(onError),
            );
            mediaPlayer.on(mediaPlayer.EVENT_PLAYER_PLAYING, () => this.playingPlayerStatus().catch(onError));
            mediaPlayer.on(mediaPlayer.EVENT_PLAYER_STOPPED, () => this.stoppedPlayerStatus().catch(onError));
        }
    }

    public destroy(): void {
        this.adapter.removeListener('stateChange', this.stateChangeHandler);

        if (this.mediaPlayer) {
            this.mediaPlayer.close();
            this.mediaPlayer = undefined;
        }
    }

    // create ioBroker states
    private async createObjects(): Promise<void> {
        const name = this.name;

        // Create a device object
        await this.adapter.setObjectNotExistsAsync(this.id, {
            type: 'device',
            common: {
                name,
            },
            native: {},
        });

        const channels: Record<'status' | 'player' | 'playlist' | 'media' | 'metadata', ioBroker.ChannelCommon> = {
            status: {
                name: `${name} status`,
                desc: 'Status channel for Chromecast device',
            },
            player: {
                name: `${name} player`,
                desc: 'Player channel for Chromecast device',
            },
            playlist: {
                name: `${name} playlist`,
                desc: 'Playlist channel for Chromecast device',
            },
            media: {
                name: `${name} media`,
                desc: 'Media channel for Chromecast device',
            },
            metadata: {
                name: `${name} metadata`,
                desc: 'Metadata channel for Chromecast device',
            },
        };

        // Create/update all channel definitions
        for (const [k, common] of Object.entries(channels)) {
            await this.adapter.setObjectNotExistsAsync(`${this.id}.${k}`, {
                type: 'channel',
                common,
                native: {},
            });
        }

        const states: Record<string, ioBroker.StateCommon> = {
            // Top level
            address: {
                name: `${name} address`,
                def: this.connection.host,
                type: 'string',
                read: true,
                write: false,
                role: 'info.ip',
                desc: 'Address of the Chromecast',
            },
            port: {
                name: `${name} port`,
                def: parseInt(this.connection.port as string, 10) || 0,
                type: 'number',
                read: true,
                write: false,
                role: 'info.port',
                desc: 'Port of the Chromecast',
            },
            enabled: {
                name: `${name} enabled`,
                def: true,
                type: 'boolean',
                read: true,
                write: true,
                role: 'switch.enable',
                desc: 'Enable Chromecast',
            },
            // Status channel
            'status.connected': {
                name: `${channels.status.name as string} connected`,
                def: false,
                type: 'boolean',
                read: true,
                write: true,
                role: 'indicator.reachable',
                desc: 'ioBroker adapter connected to Chromecast. Writing to this state will trigger a disconnect followed by a connect (this might fail).',
            },
            'status.playing': {
                name: `${channels.status.name as string} playing`,
                def: false,
                type: 'boolean',
                read: true,
                write: true,
                role: 'media.state',
                desc: 'Player loaded. Setting to false stops play.',
            },
            'status.isActiveInput': {
                name: `${channels.status.name as string} isActiveInput`,
                def: true,
                type: 'boolean',
                read: true,
                write: false,
                role: 'media.input',
                desc: '(HDMI only) TV is set to use Chromecast as input',
            },
            'status.isStandBy': {
                name: `${channels.status.name as string} isStandBy`,
                def: false,
                type: 'boolean',
                read: true,
                write: false,
                role: 'info.standby',
                desc: '(HDMI only) TV is standby',
            },
            'status.appId': {
                name: `${channels.status.name as string} appId`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'info',
                desc: 'Chromecast player application ID',
            },
            'status.displayName': {
                name: `${channels.status.name as string} displayName`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'info.name',
                desc: 'Chromecast player display name',
            },
            'status.text': {
                name: `${channels.status.name as string} text`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'info.status',
                desc: 'Chromecast player status as text',
            },
            // Player channel
            'player.url2play': {
                name: `${channels.player.name as string} url2play`,
                def: '',
                type: 'string',
                read: true,
                write: true,
                role: 'media.url',
                desc: 'URL this the chromecast should play from',
            },
            'player.announcement': {
                name: `${channels.player.name as string} announcement`,
                def: '',
                type: 'string',
                read: true,
                write: true,
                role: 'media.url.announcement',
                desc: 'URL for an announcement to play now. Current playlist (if any) will be resumed afterwards',
            },
            'player.stop': {
                name: `${channels.player.name as string} stop`,
                type: 'boolean',
                read: false,
                write: true,
                role: 'button.stop',
                desc: 'Stop playing',
            },
            'player.pause': {
                name: `${channels.player.name as string} pause`,
                type: 'boolean',
                read: false,
                write: true,
                role: 'button.pause',
                desc: 'Pause playing',
            },
            'player.play': {
                name: `${channels.player.name as string} play`,
                type: 'boolean',
                read: false,
                write: true,
                role: 'button.play',
                desc: 'Resume playing',
            },
            'player.next': {
                name: `${channels.player.name as string} next`,
                type: 'boolean',
                read: false,
                write: true,
                role: 'button.next',
                desc: 'Next title',
            },
            'player.prev': {
                name: `${channels.player.name as string} prev`,
                type: 'boolean',
                read: false,
                write: true,
                role: 'button.prev',
                desc: 'Previous title',
            },
            'player.state': {
                name: `${channels.player.name as string} state`,
                type: 'number',
                states: { 1: 'play', 2: 'stop', 0: 'pause' },
                read: true,
                write: false,
                role: 'media.state',
                desc: 'Player status play/stop/pause',
            },
            // It could be nice, if this state will be deleted
            'status.playerState': {
                name: `${channels.player.name as string} playerState`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'state',
                desc: 'Player status',
            },
            // It could be nice, if this state will be deleted
            'player.paused': {
                name: `${channels.player.name as string} paused`,
                def: false,
                type: 'boolean',
                read: true,
                write: true,
                role: 'switch',
                desc: 'is paused?',
            },
            'player.currentTime': {
                name: `${channels.player.name as string} currentTime`,
                def: 0,
                type: 'number',
                read: true,
                write: false,
                role: 'media.elapsed',
                desc: 'Playing time?',
                unit: 's',
            },
            'player.volume': {
                name: `${channels.player.name as string} volume`,
                type: 'number',
                read: true,
                write: true,
                role: 'level.volume',
                unit: '%',
                min: 0,
                max: 100,
                desc: 'Player volume in %',
            },
            'player.mute': {
                name: `${channels.player.name as string} mute`,
                def: false,
                type: 'boolean',
                read: true,
                write: true,
                role: 'media.mute',
                desc: 'Player is muted?',
            },
            // Playlist channel
            'playlist.list': {
                name: `${channels.playlist.name as string} list`,
                def: [],
                type: 'array',
                read: true,
                write: false,
                role: 'media.playlist',
                desc: 'Json array with the playlist',
            },
            'playlist.currentItemId': {
                name: `${channels.playlist.name as string} currentItemId`,
                type: 'number',
                read: true,
                write: false,
                role: 'media.track',
                desc: 'ItemId of element being played',
            },
            'playlist.jump': {
                name: `${channels.playlist.name as string} jump`,
                def: 0,
                type: 'number',
                read: false,
                write: true,
                role: 'command',
                desc: 'Number of items to jump in the playlist (it can be negative)',
            },
            'player.repeatMode': {
                name: `${channels.player.name as string} repeatMode`,
                type: 'number',
                states: { 0: 'none', 1: 'all', 2: 'one' },
                read: true,
                write: true,
                role: 'media.mode.repeat',
                desc: 'repeat mode for playing media',
            },
            'player.shuffleMode': {
                name: `${channels.player.name as string} shuffleMode`,
                type: 'boolean',
                read: true,
                write: true,
                role: 'media.mode.shuffle',
                desc: 'shuffle mode for playing media (only together with repeat mode all)',
            },
            // Media channel
            'media.streamType': {
                name: `${channels.media.name as string} streamType`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'state',
                desc: 'Type of stream being played - LIVE or BUFFERED',
            },
            'player.duration': {
                name: `${channels.player.name as string} duration`,
                def: -1,
                type: 'number',
                read: true,
                write: false,
                role: 'media.duration',
                unit: 's',
                desc: 'Duration of media being played',
            },
            'media.contentType': {
                name: `${channels.media.name as string} contentType`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'media.content',
                desc: 'Type of media being played such as audio/mp3',
            },
            'player.contentId': {
                name: `${channels.media.name as string} contentId`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'state',
                desc: 'id of content being played. Usually the URL.',
            },
            // Metadata channel (the names say "player", as they always did)
            'metadata.title': {
                name: `${channels.player.name as string} title`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'media.title',
                desc: 'Title',
            },
            'metadata.album': {
                name: `${channels.player.name as string} album`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'media.album',
                desc: 'Album',
            },
            'metadata.artist': {
                name: `${channels.player.name as string} artist`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'media.artist',
                desc: 'Artist',
            },
            'metadata.broadcastDate': {
                name: `${channels.player.name as string} broadcastDate`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'media.date',
                desc: 'Broadcast date',
            },
            'metadata.seasonNumber': {
                name: `${channels.player.name as string} seasonNumber`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'media.season',
                desc: 'Season number',
            },
            'metadata.episodeNumber': {
                name: `${channels.player.name as string} episodeNumber`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'media.episode',
                desc: 'Episode number',
            },
            'metadata.trackNumber': {
                name: `${channels.player.name as string} trackNumber`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'media.track',
                desc: 'Track number',
            },
            'metadata.cover': {
                name: `${channels.player.name as string} cover`,
                def: '',
                type: 'string',
                read: true,
                write: false,
                role: 'media.cover',
                desc: 'Cover URI',
            },
        };

        // Create/update all state definitions
        for (const [k, common] of Object.entries(states)) {
            await this.adapter.setObjectNotExistsAsync(`${this.id}.${k}`, {
                type: 'state',
                common,
                native: {},
            });
        }

        // Set some objects
        await this.updateMediaPlayerConnection(this.connection);
        await this.disconnectedMediaPlayer();
        await this.stoppedPlayerStatus();

        // Set enabled only if not set already
        let enabledState: ioBroker.State | null | undefined;
        try {
            enabledState = await this.adapter.getStateAsync(`${this.id}.enabled`);
        } catch {
            // ignore
        }

        if (!enabledState) {
            await this.adapter.setStateAsync(`${this.id}.enabled`, { val: true, ack: true });
        }

        // Set url2play only if not set already
        let url2playState: ioBroker.State | null | undefined;
        try {
            url2playState = await this.adapter.getStateAsync(`${this.id}.player.url2play`);
        } catch {
            // ignore
        }

        if (!url2playState) {
            await this.adapter.setStateAsync(`${this.id}.player.url2play`, {
                // the single slash has always been there
                val: 'http:/example.org/playme.mp3',
                ack: true,
            });
        }
    }

    private async setStateIfChanged(id: string, newState: NewState, oldVal?: unknown): Promise<void> {
        // if same value
        if (oldVal !== undefined && oldVal === newState.val) {
            return;
        }

        let state: ioBroker.State | null | undefined;
        try {
            state = await this.adapter.getStateAsync(id);
        } catch (err) {
            this.adapter.log.error(`${this.name} - Could not get ${id}:${err}`);
        }
        if (!state) {
            await this.adapter.setStateAsync(id, newState);
        } else if (newState.val !== state.val || newState.ack !== state.ack) {
            await this.adapter.setStateAsync(id, newState);
        } else {
            this.adapter.log.debug(`${this.name} - ${id} value unchanged -> SKIP`);
        }
    }

    /*
     * MediaPlayer methods
     */

    private async updateMediaPlayerConnection(connection: CastConnection): Promise<void> {
        await this.adapter.setStateAsync(`${this.id}.address`, { val: connection.host, ack: true });
        await this.adapter.setStateAsync(`${this.id}.port`, {
            val: parseInt(connection.port as string, 10) || 0,
            ack: true,
        });
    }

    private async disconnectedMediaPlayer(): Promise<void> {
        // Set connected status to false
        await this.adapter.setStateAsync(`${this.id}.status.connected`, { val: false, ack: true });
    }

    private async connectedMediaPlayer(): Promise<void> {
        // Set connected status to true
        await this.adapter.setStateAsync(`${this.id}.status.connected`, { val: true, ack: true });
    }

    private async updateClientStatus(status: CastClientStatus): Promise<void> {
        this.adapter.log.debug(`Update client status: ${this.name}`);
        // Volume
        if (this.mediaPlayer) {
            await this.adapter.setStateAsync(`${this.id}.player.volume`, {
                val: this.mediaPlayer.getVolume(),
                ack: true,
            });
            // isMuted() of castv2-player is always undefined; the real value comes with the player status
            await this.adapter.setStateAsync(`${this.id}.player.mute`, {
                val: this.mediaPlayer.isMuted(),
                ack: true,
            });
        }

        // Video Chromecast-only
        await this.adapter.setStateAsync(`${this.id}.status.isActiveInput`, {
            val: 'isActiveInput' in status ? status.isActiveInput : true,
            ack: true,
        });
        await this.adapter.setStateAsync(`${this.id}.status.isStandBy`, {
            val: 'isStandBy' in status ? status.isStandBy : false,
            ack: true,
        });

        if (Object.hasOwn(status, 'applications')) {
            const currentApplicationObject = status.applications![0];
            if (currentApplicationObject !== undefined) {
                this.adapter.log.debug(JSON.stringify(currentApplicationObject));
                await this.adapter.setStateAsync(`${this.id}.status.appId`, {
                    val: 'appId' in currentApplicationObject ? currentApplicationObject.appId : '',
                    ack: true,
                });
                await this.adapter.setStateAsync(`${this.id}.status.displayName`, {
                    val: 'displayName' in currentApplicationObject ? currentApplicationObject.displayName : '',
                    ack: true,
                });
                await this.adapter.setStateAsync(`${this.id}.status.text`, {
                    val: 'statusText' in currentApplicationObject ? currentApplicationObject.statusText : '',
                    ack: true,
                });
            }
        }
    }

    /*
     * Player methods
     */
    private async playingPlayerStatus(): Promise<void> {
        await this.adapter.setStateAsync(`${this.id}.status.playing`, { val: true, ack: true });
    }

    private async stoppedPlayerStatus(): Promise<void> {
        await this.adapter.setStateAsync(`${this.id}.status.playing`, { val: false, ack: true });
    }

    static chromecastPlayerState2IobState(chState: string, pause: boolean): number {
        // The device reports "playing", never "play", so the PAUSE branch is never reached: player.state is
        // 1 (play) also while paused or idle (documented in help.ts). The JS version even returned
        // `PLAYER_STATE.pause` (undefined) there.
        if (chState === 'stop') {
            return PLAYER_STATE.STOP;
        }
        return chState === 'play' && pause ? PLAYER_STATE.PAUSE : PLAYER_STATE.PLAY;
    }

    static chromecastRepeat2IobRepeat(chState: string | undefined): number {
        if (chState === 'REPEAT_ALL' || chState === 'REPEAT_ALL_AND_SHUFFLE') {
            return REPEAT_MODE.ALL;
        }
        return chState === 'REPEAT_SINGLE' ? REPEAT_MODE.ONE : REPEAT_MODE.NONE;
    }

    private async updatePlayerStatus(pStatus: CastPlayerStatus, pPreviousStatus?: CastPlayerStatus): Promise<void> {
        // Player channel status
        const status: CastPlayerStatus = pStatus || {};
        const cachedStatus: CastPlayerStatus = pPreviousStatus || {};

        // playerState
        const playerState = status.playerState ? status.playerState.toLowerCase() : 'stop';
        // toLocaleString() (not toLowerCase()) as in the JS version: the cached value rarely matches, so the
        // stored state is compared instead
        const cachedPlayerState = cachedStatus.playerState ? cachedStatus.playerState.toLocaleString() : 'stop';
        await this.setStateIfChanged(
            `${this.id}.status.playerState`,
            { val: playerState, ack: true },
            cachedPlayerState,
        );

        // paused
        const pause = status.playerState === 'PAUSED';
        await this.setStateIfChanged(
            `${this.id}.player.paused`,
            { val: pause, ack: true },
            cachedStatus.playerState === 'PAUSED',
        );

        // state
        const state = ChromecastDevice.chromecastPlayerState2IobState(
            (status.playerState && status.playerState.toLowerCase()) || 'stop',
            pause,
        );
        await this.setStateIfChanged(`${this.id}.player.state`, { val: state, ack: true });

        // currentTime (NaN without status). The JS version compared with `Math.floor(cachedPlayerState.currentTime)`,
        // i.e. with NaN (cachedPlayerState is a string), so the stored state is always compared.
        await this.setStateIfChanged(`${this.id}.player.currentTime`, {
            val: Math.floor(status.currentTime as number),
            ack: true,
        });

        // Playlist
        if (status.items && status.items.length > 0 && status.items[0] && status.items[0].media) {
            await this.setStateIfChanged(
                `${this.id}.playlist.list`,
                { val: JSON.stringify(status.items), ack: true },
                JSON.stringify(cachedStatus.items),
            );
        } else {
            // Uncompleted status - trigger a new one - this happens after the playlist starts again
            this.mediaPlayer
                ?.getStatusPromise()
                .catch(err => this.adapter.log.error(`${this.name}- Cannot get status: ${err}`));
        }

        // Current Item ID
        await this.setStateIfChanged(
            `${this.id}.playlist.currentItemId`,
            { val: status.currentItemId, ack: true },
            cachedStatus.currentItemId,
        );

        // repeatMode
        this.repeat = ChromecastDevice.chromecastRepeat2IobRepeat(status.repeatMode);
        await this.setStateIfChanged(
            `${this.id}.player.repeatMode`,
            { val: this.repeat, ack: true },
            ChromecastDevice.chromecastRepeat2IobRepeat(cachedStatus.repeatMode),
        );

        this.shuffle = status.shuffleMode === 'REPEAT_ALL_AND_SHUFFLE';
        await this.setStateIfChanged(
            `${this.id}.player.shuffleMode`,
            { val: this.shuffle, ack: true },
            cachedStatus.shuffleMode === 'REPEAT_ALL_AND_SHUFFLE',
        );

        // volume
        await this.setStateIfChanged(
            `${this.id}.player.volume`,
            { val: Math.round((status.volume ? status.volume.level : 1) * 100), ack: true },
            Math.round((cachedStatus.volume ? cachedStatus.volume.level : 1) * 100),
        );

        // muted
        await this.setStateIfChanged(
            `${this.id}.player.mute`,
            { val: status.volume ? status.volume.muted : false, ack: true },
            cachedStatus.volume ? cachedStatus.volume.muted : false,
        );

        // Media channel status
        const media = status.media || {};
        const cachedMedia = cachedStatus.media || {};

        // streamType
        await this.setStateIfChanged(
            `${this.id}.media.streamType`,
            { val: media.streamType || '', ack: true },
            cachedMedia.streamType || '',
        );

        // duration
        await this.setStateIfChanged(
            `${this.id}.player.duration`,
            { val: media.duration || 0, ack: true },
            cachedMedia.duration || 0,
        );

        // contentType
        await this.setStateIfChanged(
            `${this.id}.media.contentType`,
            { val: media.contentType || '', ack: true },
            cachedMedia.contentType || '',
        );

        // contentId
        await this.setStateIfChanged(
            `${this.id}.player.contentId`,
            { val: media.contentId || '', ack: true },
            cachedMedia.contentId || '',
        );

        // Metadata channel status
        const metadata = media.metadata || {};
        const cachedMetadata = cachedMedia.metadata || {};

        // title
        await this.setStateIfChanged(
            `${this.id}.metadata.title`,
            { val: metadata.title || '', ack: true },
            cachedMetadata.title || '',
        );

        // album
        await this.setStateIfChanged(
            `${this.id}.metadata.album`,
            { val: metadata.albumName || '', ack: true },
            cachedMetadata.albumName || '',
        );

        // artist
        await this.setStateIfChanged(
            `${this.id}.metadata.artist`,
            { val: metadata.artist || '', ack: true },
            cachedMetadata.artist || '',
        );

        // image
        await this.setStateIfChanged(
            `${this.id}.metadata.cover`,
            { val: metadata.images?.[0]?.url || '', ack: true },
            cachedMetadata.images?.[0]?.url || '',
        );

        // broadcast date
        await this.setStateIfChanged(
            `${this.id}.metadata.broadcastDate`,
            { val: metadata.broadcastDate || '', ack: true },
            cachedMetadata.broadcastDate || '',
        );

        // Season number (a number from the device, written as is into the string state)
        await this.setStateIfChanged(
            `${this.id}.metadata.seasonNumber`,
            { val: metadata.seasonNumber || '', ack: true },
            cachedMetadata.seasonNumber || '',
        );

        // Episode number
        await this.setStateIfChanged(
            `${this.id}.metadata.episodeNumber`,
            { val: metadata.episodeNumber || '', ack: true },
            cachedMetadata.episodeNumber || '',
        );

        // Track number
        await this.setStateIfChanged(
            `${this.id}.metadata.trackNumber`,
            { val: metadata.trackNumber || '', ack: true },
            cachedMetadata.trackNumber || '',
        );
    }

    private async playURL(url2play: string, orgUrl2play?: string): Promise<void> {
        const originalUrl = orgUrl2play === undefined ? url2play : orgUrl2play;

        if (!url2play.startsWith('http')) {
            // Not an http(s) URL -> assume local file
            this.adapter.log.debug(`${this.name} - Not a http(s) URL -> asume local file for ${url2play}`);

            // Check this the webserver has been configured
            if (!this.adapter.config.webServer) {
                this.adapter.log.error(`${this.name}- Sorry, cannot play file "${url2play}"`);
                this.adapter.log.error(`${this.name}- Please configure webserver settings first!`);
                return;
            }

            // "chromecast.0" is fixed, also for other instances, as it always was
            const exportedFilePath = `chromecast.0.files/${this.id}/exportedMedia.mp3`;
            // Try to load in a local state
            try {
                try {
                    await this.adapter.writeFileAsync(this.adapter.namespace, exportedFilePath, readFileSync(url2play));
                } catch (err) {
                    this.adapter.log.error(
                        `${this.name} - Cannot store file "${url2play}" into ${exportedFilePath}: ${err.toString()}`,
                    );
                    return;
                }
                // Calculate the exported URL
                const exportedUrl = `http://${this.adapter.config.webServer}:${this.webPort}/${exportedFilePath}`;
                this.adapter.log.debug(`Exported as ${exportedUrl}`);
                await this.playURL(exportedUrl, originalUrl);
            } catch (err) {
                this.adapter.log.error(`${this.name} - Cannot play file "${url2play}": ${err.toString()}`);
            }
            return;
        }

        // Is this a YouTube URL?
        const youtubeId = Youtube.getYoutubeId(url2play);
        if (youtubeId) {
            this.adapter.log.debug(`Trying to play YouTube (${youtubeId}) on ${this.connection.name}`);

            // TODO: do something funky with sessions & re-use?
            this.launch(Youtube, (err, player) => {
                if (err || !player) {
                    this.adapter.log.error(`Error launching Youtube: ${err}`);
                } else {
                    this.adapter.log.debug('Youtube launched, playing...');
                    player.load(youtubeId, err => {
                        if (err) {
                            this.adapter.log.error(`Error loading Youtube: ${err}`);
                        } else {
                            this.adapter.log.debug('Youtube should be playing!');
                            this.adapter
                                .setStateAsync(`${this.id}.player.url2play`, { val: originalUrl, ack: true })
                                .catch(e => this.adapter.log.error(`${this.name} - ${e}`));
                        }
                    });
                }
            });
        } else if (this.mediaPlayer) {
            this.mediaPlayer
                .playUrlPromise(url2play)
                .then(() => this.adapter.setStateAsync(`${this.id}.player.url2play`, { val: originalUrl, ack: true }))
                .catch(err =>
                    this.adapter.log.error(`${this.name} - Cannot play file "${url2play}": ${err.toString()}`),
                );
        }
    }

    // is called if a subscribed state changes
    private async onStateChange(fullId: string, state: ioBroker.State | null | undefined): Promise<void> {
        const name = this.name;
        const namespace = `${this.adapter.namespace}.${this.id}`;

        if (
            // with the dot: device "Kitchen" must not get the states of device "Kitchen_2"
            !fullId.startsWith(`${namespace}.`) ||
            !state ||
            // you can use the ack flag to detect if it is status (true) or command (false)
            state.ack ||
            !state.from ||
            state.from.startsWith(this.adapter.namespace)
        ) {
            return;
        }

        const id = fullId.substring(namespace.length + 1);

        // Warning, state can be null if it was deleted
        this.adapter.log.debug(`${name} - device stateChange ${id} ${JSON.stringify(state)}`);

        // "enabled" must work without a media player, otherwise a disabled device could never be enabled again
        if (id === 'enabled') {
            await this.initMediaPlayer();
            await this.adapter.setStateAsync(`${this.id}.enabled`, { val: state.val, ack: true });
            return;
        }

        if (!this.mediaPlayer) {
            this.adapter.log.info(`${name} - adapter disabled - ignoring  stateChange ${id} ${JSON.stringify(state)}`);
            return;
        }

        switch (id) {
            case 'player.volume':
                this.mediaPlayer
                    .setVolumePromise(state.val as number)
                    // ACK written when status update sent by Chromecast
                    .catch(err => this.adapter.log.error(`${name} - ${err}`));
                break;

            case 'player.mute':
                if (state.val) {
                    // mute
                    this.mediaPlayer
                        .mutePromise()
                        // ACK written when status update sent by Chromecast
                        .catch(err => this.adapter.log.error(`${name} - Could not mute: ${err}`));
                } else {
                    // unmute
                    this.mediaPlayer
                        .unmutePromise()
                        // ACK written when status update sent by Chromecast
                        .catch(err => this.adapter.log.error(`${name} - Could not unmute: ${err}`));
                }
                break;

            case 'status.playing':
                if (state.val) {
                    // Try to play last contentID
                    const contentState = await this.adapter.getStateAsync(`${namespace}.player.contentId`);
                    if (typeof contentState?.val === 'string' && contentState.val.startsWith('http')) {
                        await this.playURL(contentState.val);
                    } else {
                        // Try to play last url2play
                        const url2playState = await this.adapter.getStateAsync(`${namespace}.player.url2play`);
                        if (typeof url2playState?.val === 'string' && url2playState.val.startsWith('http')) {
                            await this.playURL(url2playState.val);
                        } else {
                            // Could not find a valid link to play -> set to false again
                            await this.adapter.setStateAsync(`${this.id}.status.playing`, { val: false, ack: true });
                        }
                    }
                } else {
                    this.mediaPlayer
                        .stopPromise()
                        // ACK written when status update sent by Chromecast
                        .catch(err => this.adapter.log.error(`${name} - Could not stop: ${err}`));
                }
                break;

            case 'player.pause':
                this.mediaPlayer
                    .pausePromise()
                    // ACK written when status update sent by Chromecast
                    .catch(err => this.adapter.log.error(`${name} - Could not pause: ${err}`));
                break;

            case 'player.play':
                this.mediaPlayer
                    .playPromise()
                    // ACK written when status update sent by Chromecast
                    .catch(err => this.adapter.log.error(`${name} - Could not play: ${err}`));
                break;

            case 'player.stop':
                this.mediaPlayer
                    .stopPromise()
                    // ACK written when status update sent by Chromecast
                    .catch(err => this.adapter.log.error(`${name} - Could not stop: ${err}`));
                break;

            case 'player.paused':
                if (state.val) {
                    this.mediaPlayer
                        .pausePromise()
                        // ACK written when status update sent by Chromecast
                        .catch(err => this.adapter.log.error(`${name} - Could not pause: ${err}`));
                } else {
                    this.mediaPlayer
                        .playPromise()
                        // ACK written when status update sent by Chromecast
                        .catch(err => this.adapter.log.error(`${name} - Could not resume: ${err}`));
                }
                break;

            case 'player.next':
                this.mediaPlayer
                    .jumpInPlaylistPromise(1)
                    .then(() => this.adapter.log.debug('Next done.'))
                    .catch(err => this.adapter.log.error(`${name} - Could not execute next: ${err}`));
                break;

            case 'player.prev':
                this.mediaPlayer
                    .jumpInPlaylistPromise(-1)
                    .then(() => this.adapter.log.debug('Prev done.'))
                    .catch(err => this.adapter.log.error(`${name} - Could not execute prev: ${err}`));
                break;

            case 'playlist.jump':
                this.mediaPlayer
                    .jumpInPlaylistPromise(state.val as number)
                    .then(() => this.adapter.setStateAsync(`${this.id}.playlist.jump`, { val: state.val, ack: true }))
                    .catch(err => this.adapter.log.error(`${name} - Could not jump: ${err}`));
                break;

            case 'player.repeatMode': {
                // parseInt runs first, so the string values "all" / "one" that the JS version also checked never matched
                const repeatMode = parseInt(String(state.val), 10);
                this.repeat = repeatMode;

                let chromecastRepeatMode: RepeatMode;
                if (repeatMode === REPEAT_MODE.ALL) {
                    chromecastRepeatMode = this.shuffle ? 'REPEAT_ALL_AND_SHUFFLE' : 'REPEAT_ALL';
                } else {
                    chromecastRepeatMode = repeatMode === REPEAT_MODE.ONE ? 'REPEAT_SINGLE' : 'REPEAT_OFF';
                }
                this.mediaPlayer
                    .setRepeatModePromise(chromecastRepeatMode)
                    // ACK written when status update sent by Chromecast
                    .catch(err => this.adapter.log.error(`${name} - Could not set repeatMode: ${err}`));
                break;
            }

            // Typo kept from the JS version: the state is "player.shuffleMode", so writing it ends in "default" and
            // shuffle cannot be set (documented in help.ts).
            case 'player.shuffelMode': {
                let chromecastRepeatMode: RepeatMode;
                if (state.val) {
                    chromecastRepeatMode = 'REPEAT_ALL_AND_SHUFFLE';
                    this.shuffle = true;
                    await this.setStateIfChanged(`${namespace}.player.repeatMode`, { val: 1, ack: true }, this.repeat);
                } else {
                    this.shuffle = false;
                    if (this.repeat === REPEAT_MODE.ALL) {
                        chromecastRepeatMode = 'REPEAT_ALL';
                    } else if (this.repeat === REPEAT_MODE.ONE) {
                        chromecastRepeatMode = 'REPEAT_SINGLE';
                    } else {
                        chromecastRepeatMode = 'REPEAT_OFF';
                    }
                    await this.setStateIfChanged(
                        `${namespace}.player.repeatMode`,
                        { val: chromecastRepeatMode, ack: true },
                        this.repeat,
                    );
                }
                this.mediaPlayer
                    .setRepeatModePromise(chromecastRepeatMode)
                    // ACK written when status update sent by Chromecast
                    .catch(err => this.adapter.log.error(`${name} - Could not repeatAllShuffle: ${err}`));
                break;
            }

            case 'player.announcement':
                if (typeof state.val === 'string' && state.val.includes('http')) {
                    const url = state.val;
                    this.mediaPlayer
                        .playAnnouncementPromise(url)
                        .then(() =>
                            this.adapter.setStateAsync(`${namespace}.player.announcement`, { val: url, ack: true }),
                        )
                        .catch(err => this.adapter.log.error(`${name} - Could not play announcement: ${err}`));
                } else {
                    this.adapter.log.warn(`${name} - Announcement URL is not valid: ${state.val}`);
                }
                break;

            case 'player.url2play':
                await this.playURL(state.val as string);
                break;

            default:
                this.adapter.log.error(`${name} - Sorry, update for ${id} not supported!`);
                break;
        }
    }

    private networkScannerChange(connection: CastConnection): void {
        this.adapter.log.debug(`${connection.name} - refreshing connection`);
        if (this.mediaPlayer) {
            this.mediaPlayer._updateDevice(connection);
        } else {
            this.initMediaPlayer().catch(e =>
                this.adapter.log.error(`${connection.name} - Could not init media player: ${e}`),
            );
        }
    }

    private launch<T>(app: ApplicationClass<T>, callback: (err: Error | null, player?: T) => void): void {
        const client = this.mediaPlayer?._client._client;
        if (!client) {
            return;
        }

        this.adapter.log.debug('Getting sessions...');

        client.getSessions((err, sessions) => {
            if (err) {
                return callback(err);
            }

            this.adapter.log.debug(`Sessions found ${sessions.length}`);

            const filtered = sessions.filter(session => app && session.appId === app.APP_ID);
            this.adapter.log.debug(`Sessions after filter: ${filtered.length}`);
            const session = filtered.shift();

            if (session) {
                this.adapter.log.debug('Joining session...');
                client.join(session, app, callback);
            } else if (app) {
                this.adapter.log.debug('Launching new app...');
                client.launch(app, callback);
            } else {
                callback(new Error('no session started'));
            }
        });
    }
}
