'use strict';
/* jshint esversion: 6 */
/* jslint node: true */
const fs = require('fs');
const { LogWrapper, MediaPlayer } = require('castv2-player');
const arp = require('node-arp');

function getMac(ip) {
    return new Promise((resolve, reject) =>
        arp.getMAC(ip, (err, mac) => err ? reject(err) : resolve(mac)));
}

/*
 * ChromecastDevice class
 */

// const {JSON} = require("mocha/lib/reporters");
module.exports = async function (adapter, webPort) {
    const MediaPlayerWithLog = MediaPlayer(new LogWrapper(adapter.log));

    const REPEAT_MODE = {
        NONE: 0,
        ALL: 1,
        ONE: 2
    };
    const PLAYER_STATE = {
        PAUSE: 0,
        PLAY: 1,
        STOP: 2,
    };

    class ChromecastDevice {
        // constructor
        constructor(connection) {
            this.shuffle = false;
            this.repeat = false;

            this._connection = connection;
            this._name = connection.name.replace(/[.\s]+/g, '_');

            this.main()
                .catch(e => adapter.log.error(`${this._name} - ${e}`));
        } // end of constructor

        async main() {
            if (this._connection.type === 'Google Cast Group') {
                this.id = `groups.${this._connection.id.replace(/-/g, '')}`;
            } else {
                try {
                    this.id = await getMac(this._connection.host);
                } catch (e) {
                    adapter.log.error(`${this._name} - Cannot get MAC for "${this._connection.host}": ${e.toString()}`);
                }
            }
            // Create ioBroker states
            await this._createObjects();

            // MEDIA PLAYER
            await this._initMediaPlayer();

            // IOBROKER
            // reset status of player states
            await this._updatePlayerStatus({});

            // Register for updates coming from ioBroker
            adapter.on('stateChange', this._ioBrokerChange.bind(this));

            // Register for updates coming from network scanner
            this._connection.registerForUpdates(this._networkScannerChange.bind(this));
        }

        // Media player
        async _initMediaPlayer() {
            if (this._mediaPlayer) {
                this._mediaPlayer.close();
                delete this._mediaPlayer;
            }

            let state;
            try {
                state = await adapter.getStateAsync(`${this.id}.enabled`);
            } catch (e) {
                // ignore
            }

            if (state && !state.val) {
                adapter.log.info(`${this._name} - not enabled`);
            } else {
                // Create media player
                this._mediaPlayer = new MediaPlayerWithLog(this._connection);

                // register for mediaPlayer updates
                // client
                this._mediaPlayer.on(this._mediaPlayer.EVENT_CLIENT_STATUS, this._updateClientStatus.bind(this));
                this._mediaPlayer.on(this._mediaPlayer.EVENT_CLIENT_CONNECTED, this._connectedMediaPlayer.bind(this));
                this._mediaPlayer.on(this._mediaPlayer.EVENT_CLIENT_DISCONNECTED, this._disconnectedMediaPlayer.bind(this));
                // player
                this._mediaPlayer.on(this._mediaPlayer.EVENT_PLAYER_STATUS, this._updatePlayerStatus.bind(this));
                this._mediaPlayer.on(this._mediaPlayer.EVENT_PLAYER_PLAYING, this._playingPlayerStatus.bind(this));
                this._mediaPlayer.on(this._mediaPlayer.EVENT_PLAYER_STOPPED, this._stoppedPlayerStatus.bind(this));
            }
        }

        destroy() {
            adapter.removeListener('stateChange', this._ioBrokerChange.bind(this));

            if (this._mediaPlayer) {
                this._mediaPlayer.close();
                delete this._mediaPlayer;
            }
        }

        // create ioBroker states
        async _createObjects() {
            const name = this._name;

            // Create a device object
            await adapter.setObjectNotExistsAsync(this.id, {
                type: 'device',
                common: {
                    name
                },
                native: {}
            });

            // var CHANNEL_STATUS    = name + '.status';
            const channels = {
                'status': {
                    name: `${name} status`,
                    desc: 'Status channel for Chromecast device'
                },
                'player': {
                    name: `${name} player`,
                    desc: 'Player channel for Chromecast device'
                },
                'playlist': {
                    name: `${name} playlist`,
                    desc: 'Playlist channel for Chromecast device'
                },
                'media': {
                    name: `${name} media`,
                    desc: 'Media channel for Chromecast device'
                },
                'metadata': {
                    name: `${name} metadata`,
                    desc: 'Metadata channel for Chromecast device'
                }
            };

            // Create/update all channel definitions
            for (const k in channels) {
                if (channels.hasOwnProperty(k)) {
                    await adapter.setObjectNotExistsAsync(`${this.id}.${k}`, {
                        type: 'channel',
                        common: channels[k],
                        native: {},
                    });
                }
            }

            let states = {
                // Top level
                'address': {
                    name: `${name} address`,
                    def: this._connection.host,
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'info.ip',
                    desc: 'Address of the Chromecast'
                },
                'port': {
                    name: `${name} port`,
                    def: parseInt(this._connection.port, 10) || 0,
                    type: 'number',
                    read: true,
                    write: false,
                    role: 'info.port',
                    desc: 'Port of the Chromecast'
                },
                'enabled': {
                    name: `${name} enabled`,
                    def: true,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'switch.enable',
                    desc: 'Enable Chromecast'
                },
                // Status channel
                'status.connected': {
                    name: `${channels.status.name} connected`,
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'indicator.reachable',
                    desc: 'ioBroker adapter connected to Chromecast. Writing to this state will trigger a disconnect followed by a connect (this might fail).'
                },
                'status.playing': {
                    name: `${channels.status.name} playing`,
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'media.state',
                    desc: 'Player loaded. Setting to false stops play.'
                },
                'status.isActiveInput': {
                    name: `${channels.status.name} isActiveInput`,
                    def: true,
                    type: 'boolean',
                    read: true,
                    write: false,
                    role: 'media.input',
                    desc: '(HDMI only) TV is set to use Chromecast as input'
                },
                'status.isStandBy': {
                    name: `${channels.status.name} isStandBy`,
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: false,
                    role: 'info.standby',
                    desc: '(HDMI only) TV is standby'
                },
                'status.displayName': {
                    name: `${channels.status.name} displayName`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'info.name',
                    desc: 'Chromecast player display name'
                },
                'status.text': {
                    name: `${channels.status.name} text`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'info.status',
                    desc: 'Chromecast player status as text'
                },
                // Player channel
                'player.url2play': {
                    name: `${channels.player.name} url2play`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: true,
                    role: 'media.url',
                    desc: 'URL this the chromecast should play from'
                },
                'player.announcement': {
                    name: `${channels.player.name} announcement`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: true,
                    role: 'media.url.announcement',
                    desc: 'URL for an announcement to play now. Current playlist (if any) will be resumed afterwards'
                },
                'player.stop': {
                    name: `${channels.player.name} stop`,
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.stop',
                    desc: 'Stop playing'
                },
                'player.pause': {
                    name: `${channels.player.name} pause`,
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.pause',
                    desc: 'Pause playing'
                },
                'player.play': {
                    name: `${channels.player.name} play`,
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.play',
                    desc: 'Resume playing'
                },
                'player.next': {
                    name: `${channels.player.name} next`,
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.next',
                    desc: 'Next title'
                },
                'player.prev': {
                    name: `${channels.player.name} prev`,
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.prev',
                    desc: 'Previous title'
                },
                'player.state': {
                    name: `${channels.player.name} state`,
                    type: 'number',
                    states: {1: 'play', 2: 'stop', 0: 'pause'},
                    read: true,
                    write: false,
                    role: 'media.state',
                    desc: 'Player status play/stop/pause'
                },
                // It could be nice, if this state will be deleted
                'status.playerState': {
                    name: `${channels.player.name} playerState`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'state',
                    desc: 'Player status'
                },
                // It could be nice, if this state will be deleted
                'player.paused': {
                    name: `${channels.player.name} paused`,
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'switch',
                    desc: 'is paused?'
                },
                'player.currentTime': {
                    name: `${channels.player.name} currentTime`,
                    def: 0,
                    type: 'number',
                    read: true,
                    write: false,
                    role: 'media.elapsed',
                    desc: 'Playing time?',
                    unit: 's'
                },
                'player.volume': {
                    name: `${channels.player.name} volume`,
                    type: 'number',
                    read: true,
                    write: true,
                    role: 'level.volume',
                    unit: '%',
                    min: 0,
                    max: 100,
                    desc: 'Player volume in %'
                },
                'player.mute': {
                    name: `${channels.player.name} mute`,
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'media.mute',
                    desc: 'Player is muted?'
                },
                // Playlist channel
                'playlist.list': {
                    name: `${channels.playlist.name} list`,
                    def: [],
                    type: 'array',
                    read: true,
                    write: false,
                    role: 'media.playlist',
                    desc: 'Json array with the playlist'
                },
                'playlist.currentItemId': {
                    name: `${channels.playlist.name} currentItemId`,
                    type: 'number',
                    read: true,
                    write: false,
                    role: 'media.track',
                    desc: 'ItemId of element being played'
                },
                'playlist.jump': {
                    name: `${channels.playlist.name} jump`,
                    def: 0,
                    type: 'number',
                    read: false,
                    write: true,
                    role: 'command',
                    desc: 'Number of items to jump in the playlist (it can be negative)'
                },
                'player.repeatMode': {
                    name: `${channels.player.name} repeatMode`,
                    type: 'number',
                    states: {0: 'none', 1: 'all', 2: 'one'},
                    read: true,
                    write: true,
                    role: 'media.mode.repeat',
                    desc: 'repeat mode for playing media'
                },
                'player.shuffleMode': {
                    name: `${channels.player.name} shuffleMode`,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'media.mode.shuffle',
                    desc: 'shuffle mode for playing media (only together with repeat mode all)'
                },
                // Media channel
                'media.streamType': {
                    name: `${channels.media.name} streamType`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'state',
                    desc: 'Type of stream being played - LIVE or BUFFERED'
                },
                'player.duration': {
                    name: `${channels.player.name} duration`,
                    def: -1,
                    type: 'number',
                    read: true,
                    write: false,
                    role: 'media.duration',
                    unit: 's',
                    desc: 'Duration of media being played'
                },
                'media.contentType': {
                    name: `${channels.media.name} contentType`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.content',
                    desc: 'Type of media being played such as audio/mp3'
                },
                'player.contentId': {
                    name: `${channels.media.name} contentId`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'state',
                    desc: 'id of content being played. Usually the URL.'
                },
                // Metadata channel
                'metadata.title': {
                    name: `${channels.player.name} title`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.title',
                    desc: 'Title'
                },
                'metadata.album': {
                    name: `${channels.player.name} album`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.album',
                    desc: 'Album'
                },
                'metadata.artist': {
                    name: `${channels.player.name} artist`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.artist',
                    desc: 'Artist'
                },
                'metadata.broadcastDate': {
                    name: `${channels.player.name} broadcastDate`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.date',
                    desc: 'Broadcast date'
                },
                'metadata.seasonNumber': {
                    name: `${channels.player.name} seasonNumber`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.season',
                    desc: 'Season number'
                },
                'metadata.episodeNumber': {
                    name: `${channels.player.name} episodeNumber`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.episode',
                    desc: 'Episode number'
                },
                'metadata.trackNumber': {
                    name: `${channels.player.name} trackNumber`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.track',
                    desc: 'Track number'
                },
                'metadata.cover': {
                    name: `${channels.player.name} cover`,
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.cover',
                    desc: 'Cover URI'
                },
                // Exported media
                'exportedMedia': {
                    name: 'mp3',
                    type: 'file',
                    read: true,
                    write: false,
                    role: 'media.link',
                    desc: `Can be accessed from web server under http:// ${adapter.config.webServer}:${webPort}/state/chromecast.0.<device name>.exportedMedia.mp3`,
                }
            };

            // Delete legacy states
            // adapter.deleteState(channels.player.name + '.jump');
            // adapter.deleteState(channels.player.name + '.repeatMode');

            // Create/update all state definitions
            for (let k in states) {
                if (states.hasOwnProperty(k)) {
                    await adapter.setObjectNotExistsAsync(`${this.id}.${k}`, {
                        type: 'state',
                        common: states[k],
                        native: {}
                    });
                }
            }

            // Set some objects
            await this._updateMediaPlayerConnection(this._connection);
            await this._disconnectedMediaPlayer();
            await this._stoppedPlayerStatus();

            // Set enabled only if not set already
            let enabledState
            try {
                enabledState = await adapter.getStateAsync(`${this.id}.enabled`);
            } catch (e) {
                // ignore
            }

            if (!enabledState) {
                await adapter.setStateAsync(`${this.id}.enabled`, {val: true, ack: true});
            }

            // Set url2play only if not set already
            let url2playState
            try {
                url2playState = await adapter.getStateAsync(`${this.id}.player.url2play`);
            } catch (e) {
                // ignore
            }

            if (!url2playState) {
                await adapter.setStateAsync(`${this.id}.player.url2play`, {
                    val: 'http:/example.org/playme.mp3',
                    ack: true
                });
            }
        } // END of createObjects

        async setStateIfChanged(id, val, oldVal) {
            // if same value
            if (oldVal !== undefined && oldVal === val.val) {
                return;
            }

            let state;
            try {
                state = await adapter.getStateAsync(id);
            } catch (err) {
                adapter.log.error(`${this._name} - Could not get ${id}:${err}`);
            }
            if (!state) {
                await adapter.setStateAsync(id, val);
            } else if (val.val !== state.val || val.ack !== state.ack) {
                await adapter.setStateAsync(id, val);
            } else {
                adapter.log.debug(`${this._name} - ${id} value unchanged -> SKIP`);
            }
        }

        /*
         * MediaPlayer methods
         */

        async _updateMediaPlayerConnection(connection) {
            await adapter.setStateAsync(`${this.id}.address`, {val: connection.host, ack: true});
            await adapter.setStateAsync(`${this.id}.port`, {val: parseInt(connection.port, 10) || 0, ack: true});
        }

        async _disconnectedMediaPlayer() {
            // Set connected status to false
            await adapter.setStateAsync(`${this.id}.status.connected`, {val: false, ack: true});
        }

        async _connectedMediaPlayer() {
            // Set playing and connected status to false
            await adapter.setStateAsync(`${this.id}.status.connected`, {val: true, ack: true});
        }

        async _updateClientStatus(status/*, previousStatus*/) {
            adapter.log.info(`Update client status: ${this._name}`);
            // Volume
            if (this._mediaPlayer) {
                await adapter.setStateAsync(`${this.id}.player.volume`, {val: this._mediaPlayer.getVolume(), ack: true});
                await adapter.setStateAsync(`${this.id}.player.mute`, {val: this._mediaPlayer.isMuted(), ack: true});
            }

            // Video Chromecast-only
            await adapter.setStateAsync(`${this.id}.status.isActiveInput`, {
                val: ('isActiveInput' in status ? status.isActiveInput : true),
                ack: true
            });
            await adapter.setStateAsync(`${this.id}.status.isStandBy`, {
                val: ('isStandBy' in status ? status.isStandBy : false),
                ack: true
            });

            if (status.hasOwnProperty('applications')) {
                let currentApplicationObject = status.applications[0];
                if (currentApplicationObject !== undefined) {
                    await adapter.setStateAsync(`${this.id}.status.displayName`, {
                        val: ('displayName' in currentApplicationObject ? currentApplicationObject.displayName : ''),
                        ack: true
                    });
                    await adapter.setStateAsync(`${this.id}.status.text`, {
                        val: ('statusText' in currentApplicationObject ? currentApplicationObject.statusText : ''),
                        ack: true
                    });
                }
            }
        }

        /*
         * Player methods
         */
        async _playingPlayerStatus() {
            await adapter.setStateAsync(`${this.id}.status.playing`, {val: true, ack: true});
        }

        async _stoppedPlayerStatus() {
            await adapter.setStateAsync(`${this.id}.status.playing`, {val: false, ack: true});
        }

        static chromecastPlayerState2IobState(chState, pause) {
            return chState === 'stop' ? PLAYER_STATE.STOP :
                (chState === 'play' && pause ? PLAYER_STATE.pause : PLAYER_STATE.PLAY)
        }

        static chromecastRepeat2IobRepeat(chState) {
            return chState === 'REPEAT_ALL' || chState === 'REPEAT_ALL_AND_SHUFFLE' ? REPEAT_MODE.ALL :
                (chState === 'REPEAT_SINGLE' ? REPEAT_MODE.ONE : REPEAT_MODE.NONE);
        }

        async _updatePlayerStatus(pStatus, pPreviousStatus) {
            /*
             * {"mediaSessionId":2,
             *  "playbackRate":1,
             *  "playerState":"PLAYING",
             *  "currentTime":51.304,
             *  "supportedMediaCommands":15,
             *  "volume":{"level":1,
             *            "muted":false},
             *  "media":{"contentId":"/library/metadata/8574",
             *           "streamType":"BUFFERED",
             *           "contentType":"music",
             *           "customData":{...},
             *           "duration":180.271,
             *           "metadata":{"metadataType":3,
             *                       "albumName":"Yellow Submarine",
             *                       "title":"Sea Of Time",
             *                       "albumArtist":"The Beatles",
             *                       "artist":"The Beatles",
             *                       "trackNumber":8,
             *                       "discNumber":1}},
             *           "currentItemId":2,
             *           "items":[{"itemId":2,
             *                     "media":{"contentId":"/library/metadata/8574",
             *                              "streamType":"BUFFERED",
             *                              "contentType":"music",
             *                              "customData":{...},
             *                              "duration":180.271,
             *                              "metadata":{"metadataType":3,
             *                                          "albumName":"Yellow Submarine",
             *                                          "title":"Sea Of Time",
             *                                          "albumArtist":"The Beatles",
             *                                          "artist":"The Beatles",
             *                                          "trackNumber":8,
             *                                          "discNumber":1}
             *                              },
             *                     "autoplay":true}],
             *           "repeatMode":"REPEAT_OFF",
             *           "customData":{...},
             *           "idleReason":null}
             */
            // console.log(this._name + ' - Player status: ' + JSON.stringify(pStatus));

            // Player channel status
            let status = pStatus ? pStatus : {};
            let cachedStatus = pPreviousStatus ? pPreviousStatus : {};

            // playerState
            let playerState = status.playerState ? status.playerState.toLowerCase() : 'stop';
            let cachedPlayerState = cachedStatus.playerState ? cachedStatus.playerState.toLocaleString() : 'stop';
            await this.setStateIfChanged(`${this.id}.status.playerState`,
                {val: playerState, ack: true},
                cachedPlayerState);

            // paused
            let pause = status.playerState === 'PAUSED';
            await this.setStateIfChanged(`${this.id}.player.paused`,
                {val: pause, ack: true},
                cachedStatus.playerState === 'PAUSED');

            // state
            let state = ChromecastDevice.chromecastPlayerState2IobState((status.playerState && status.playerState.toLowerCase() || 'stop'), pause);
            await this.setStateIfChanged(`${this.id}.player.state`, {val: state, ack: true});

            // currentTime
            await this.setStateIfChanged(`${this.id}.player.currentTime`,
                {val: Math.floor(status.currentTime), ack: true},
                Math.floor(cachedPlayerState.currentTime));

            // Playlist
            if (status.items &&
                status.items.length > 0 &&
                status.items[0] &&
                status.items[0].media
            ) {
                await this.setStateIfChanged(`${this.id}.playlist.list`,
                    {val: JSON.stringify(status.items), ack: true},
                    JSON.stringify(cachedStatus.items));
            } else {
                // Uncompleted status - trigger a new one - this happens after the playlist starts again
                this._mediaPlayer && this._mediaPlayer.getStatusPromise().catch(err => adapter.log.error(`${this._name}- Cannot get status: ${err}`));
            }

            // Current Item ID
            await this.setStateIfChanged(`${this.id}.playlist.currentItemId`,
                {val: status.currentItemId, ack: true},
                cachedStatus.currentItemId);

            // repeatMode
            this.repeat = ChromecastDevice.chromecastRepeat2IobRepeat(status.repeatMode);
            await this.setStateIfChanged(`${this.id}.player.repeatMode`,
                {val: this.repeat, ack: true},
                ChromecastDevice.chromecastRepeat2IobRepeat(cachedStatus.repeatMode));

            this.shuffle = status.shuffleMode === 'REPEAT_ALL_AND_SHUFFLE';
            await this.setStateIfChanged(`${this.id}.player.shuffleMode`,
                {val: this.shuffle, ack: true},
                cachedStatus.shuffleMode === 'REPEAT_ALL_AND_SHUFFLE');

            // volume
            await this.setStateIfChanged(`${this.id}.player.volume`,
                {val: Math.round(('volume' in status ? status.volume.level : 1) * 100), ack: true},
                Math.round(('volume' in cachedStatus ? cachedStatus.volume.level : 1) * 100));

            // muted
            await this.setStateIfChanged(`${this.id}.player.mute`,
                {val: ('volume' in status ? status.volume.muted : false), ack: true},
                ('volume' in cachedStatus ? cachedStatus.volume.muted : false));

            // Media channel status
            let media = status.media ? status.media : {};
            let cachedMedia = cachedStatus.media ? cachedStatus.media : {};

            // streamType
            await this.setStateIfChanged(`${this.id}.media.streamType`,
                {val: media.streamType || '', ack: true},
                cachedMedia.streamType || '');

            // duration
            await this.setStateIfChanged(`${this.id}.player.duration`,
                {val: media.duration || 0, ack: true},
                cachedMedia.duration || 0);

            // contentType
            await this.setStateIfChanged(`${this.id}.media.contentType`,
                {val: media.contentType || '', ack: true},
                cachedMedia.contentType || '');

            // contentId
            await this.setStateIfChanged(`${this.id}.player.contentId`,
                {val: media.contentId || '', ack: true},
                cachedMedia.contentId || '');

            // Metadata channel status
            let metadata = media.metadata ? media.metadata : {};
            let cachedMetadata = cachedMedia.metadata ? cachedMedia.metadata : {};

            // title
            await this.setStateIfChanged(`${this.id}.metadata.title`,
                {val: metadata.title || '', ack: true},
                cachedMetadata.title || '');

            // album
            await this.setStateIfChanged(`${this.id}.metadata.album`,
                {val: metadata.albumName || '', ack: true},
                cachedMetadata.albumName || '');

            // artist
            await this.setStateIfChanged(`${this.id}.metadata.artist`,
                {val: metadata.artist || '', ack: true},
                cachedMetadata.artist || '');

            // image
            await this.setStateIfChanged(`${this.id}.metadata.cover`,
                {val: (metadata.images && metadata.images[0] && metadata.images[0].url) || '', ack: true},
                (cachedMetadata.images && cachedMetadata.images[0] && cachedMetadata.images[0].url) || '');

            // broadcast date
            await this.setStateIfChanged(`${this.id}.metadata.broadcastDate`,
                {val: metadata.broadcastDate || '', ack: true},
                cachedMetadata.broadcastDate || '');

            // Season number
            await this.setStateIfChanged(`${this.id}.metadata.seasonNumber`,
                {val: metadata.seasonNumber || '', ack: true},
                cachedMetadata.seasonNumber || '');

            // Episode number
            await this.setStateIfChanged(`${this.id}.metadata.episodeNumber`,
                {val: metadata.episodeNumber || '', ack: true},
                cachedMetadata.episodeNumber || '');

            // Track number
            await this.setStateIfChanged(`${this.id}.metadata.trackNumber`,
                {val: metadata.trackNumber || '', ack: true},
                cachedMetadata.trackNumber || '');
        }

        async _playURL(url2play, org_url2play/*, streamType */) {
            if (org_url2play === undefined) {
                org_url2play = url2play;
            }

            // Assume live stream by default
            /* if (streamType === undefined) {
                streamType = 'LIVE';
            }*/

            if (!url2play.startsWith('http')) {
                // Not an http(s) URL -> assume local file
                adapter.log.info('%s - Not a http(s) URL -> asume local file for %s', this._name, url2play);

                // Check this the webserver has been configured
                if (!adapter.config.webServer) {
                    adapter.log.error(`${this._name}- Sorry, cannot play file "${url2play}"`);
                    adapter.log.error(`${this._name}- Please configure webserver settings first!`);
                    return;
                }

                let exportedFileState = `${adapter.namespace}.${this.id}.exportedMedia`;
                // Try to load in a local state
                try {
                    try {
                        await adapter.setForeignBinaryStateAsync(exportedFileState, fs.readFileSync(url2play));
                    } catch (err) {
                        adapter.log.error(`${this._name} - Cannot store file "${url2play}" into ${exportedFileState}: ${err.toString()}`);
                        return;
                    }
                    // Calculate the exported URL
                    url2play = `http:// ${adapter.config.webServer}:${webPort}/state/${exportedFileState}`;
                    adapter.log.info(`Exported as ${url2play}`);
                    await this._playURL(url2play, org_url2play, 'BUFFERED');
                } catch (err) {
                    adapter.log.error(`${this._name} - Cannot play file "${url2play}": ${err.toString()}`);
                }
                return;
            }

            this._mediaPlayer && this._mediaPlayer.playUrlPromise(url2play /*org_url2play, streamType*/)
                .then(() => adapter.setStateAsync(`${this.id}.player.url2play`, {val: org_url2play, ack: true}))
                .catch(err => adapter.log.error(`${this._name} - Cannot play file "${url2play}": ${err.toString()}`));
        }

        // is called if a subscribed state changes
        async _ioBrokerChange(id, state) {
            const name = this._name;
            const namespace = `${adapter.namespace}.${this.id}`;

            if ((id.indexOf(namespace) !== 0) ||
                !state ||
                // you can use the ack flag to detect if it is status (true) or command (false)
                state.ack ||
                !state.from ||
                state.from.startsWith(adapter.namespace)
            ) {
                return;
            }

            id = id.substring(namespace.length + 1);

            // Warning, state can be null if it was deleted
            adapter.log.debug(`${name} - device stateChange ${id} ${JSON.stringify(state)}`);

            if (!this._mediaPlayer) {
                adapter.log.info(`${name} - adapter disabled - ignoring  stateChange ${id} ${JSON.stringify(state)}`);
                return;
            }

            switch (id) {
                case 'enabled':
                    await this._initMediaPlayer();
                    await adapter.setStateAsync(id, {val: state.val, ack: true});
                    break;
                case 'player.volume':
                    this._mediaPlayer.setVolumePromise(state.val)
                        // ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(`${name} - ${err}`));
                    break;
                case 'player.mute':
                    if (state.val) {
                        // mute
                        this._mediaPlayer.mutePromise()
                            // ACK written when status update sent by Chromecast
                            .catch(err => adapter.log.error(`${name} - Could not mute: ${err}`));
                    } else {
                        // unmute
                        this._mediaPlayer.unmutePromise()
                            // ACK written when status update sent by Chromecast
                            .catch(err => adapter.log.error(`${name} - Could not unmute: ${err}`));
                    }
                    break;
                case 'status.playing':
                    if (state.val) {
                        // Try to play last contentID
                        const contentState = await adapter.getStateAsync(`${namespace}.player.contentId`);
                        if (contentState && contentState.val && contentState.val.startsWith('http')) {
                            await this._playURL(contentState.val);
                        } else {
                            // Try to play last url2play
                            const url2playState = await adapter.getStateAsync(`${namespace}.player.url2play`);
                            if (url2playState && url2playState.val && url2playState.val.startsWith('http')) {
                                await this._playURL(url2playState.val);
                            } else {
                                // Could not find a valid link to play -> set to false again
                                await adapter.setStateAsync(id, false);
                            }
                        }
                    } else {
                        this._mediaPlayer.stopPromise()
                            // ACK written when status update sent by Chromecast
                            .catch(err => adapter.log.error(`${name} - Could not stop: ${err}`));
                    }
                    break;
                case 'player.pause':
                    this._mediaPlayer.pausePromise()
                        // ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(`${name} - Could not pause: ${err}`));
                    break;
                case 'player.play':
                    this._mediaPlayer.playPromise()
                        // ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(`${name} - Could not play: ${err}`));
                    break;
                case 'player.stop':
                    this._mediaPlayer.stopPromise()
                        // ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(`${name} - Could not stop: ${err}`));
                    break;
                case 'player.paused':
                    if (state.val) {
                        this._mediaPlayer.pausePromise()
                            // ACK written when status update sent by Chromecast
                            .catch(err => adapter.log.error(`${name} - Could not pause: ${err}`));
                    } else {
                        this._mediaPlayer.playPromise()
                            // ACK written when status update sent by Chromecast
                            .catch(err => adapter.log.error(`${name} - Could not resume: ${err}`));
                    }
                    break;
                case 'player.next':
                    this._mediaPlayer.jumpInPlaylistPromise(1)
                        .then(() => adapter.log.debug('Next done.'))
                        .catch(err => adapter.log.error(`${name} - Could not execute next: ${err}`));
                    break;
                case 'player.prev':
                    this._mediaPlayer.jumpInPlaylistPromise(-1)
                        .then(() => adapter.log.debug('Prev done.'))
                        .catch(err => adapter.log.error(`${name} - Could not execute prev: ${err}`));
                    break;
                case 'playlist.jump':
                    this._mediaPlayer.jumpInPlaylistPromise(state.val)
                        .then(() => adapter.setStateAsync(id, {val: state.val, ack: true}))
                        .catch(err => adapter.log.error(`${name} - Could not jump: ${err}`));
                    break;
                case 'player.repeatMode':
                    state.val = parseInt(state.val, 10);
                    this.repeat = state.val;

                    this._mediaPlayer.setRepeatModePromise(
                        state.val === REPEAT_MODE.ALL || state.val === 'all' ?
                            (this.shuffle ? 'REPEAT_ALL_AND_SHUFFLE' : 'REPEAT_ALL')
                            :
                            (state.val === REPEAT_MODE.ONE || state.val === 'one' ? 'REPEAT_SINGLE' : 'REPEAT_OFF')
                    )
                        // ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(`${name} - Could not set repeatMode: ${err}`));
                    break;
                case 'player.shuffelMode':
                    if (state.val) {
                        state.val = 'REPEAT_ALL_AND_SHUFFLE';
                        this.shuffle = true;
                        await this.setStateIfChanged(`${namespace}.player.repeatMode`, {val: 1, ack: true}, this.repeat);
                    } else {
                        this.shuffle = false;
                        if (this.repeat === REPEAT_MODE.ALL) {
                            state.val = 'REPEAT_ALL';
                        } else if (this.repeat === REPEAT_MODE.ONE) {
                            state.val = 'REPEAT_SINGLE';
                        } else {
                            state.val = 'REPEAT_OFF';
                        }
                        await this.setStateIfChanged(`${namespace}.player.repeatMode`, {
                            val: state.val,
                            ack: true
                        }, this.repeat);
                    }
                    this._mediaPlayer.setRepeatModePromise(state.val)
                        // ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(`${name} - Could not repeatAllShuffle: ${err}`));
                    break;
                case 'player.announcement':
                    this._mediaPlayer.playAnnouncementPromise(state.val)
                        .then(() => adapter.setStateAsync(`${namespace}.player.announcement`, {val: state.val, ack: true}))
                        .catch(err => adapter.log.error(`${name} - Could not play announcement: ${err}`));
                    break;
                case 'player.url2play':
                    await this._playURL(state.val);
                    break;
                default:
                    adapter.log.error(`${name} - Sorry, update for ${id} not supported!`);
                    break;
            }
        } // end of _ioBrokerChange

        async _networkScannerChange(connection) {
            adapter.log.debug(`${connection.name} - refreshing connection`);
            if (this._mediaPlayer) {
                this._mediaPlayer._updateDevice(connection);
            } else {
                this._initMediaPlayer()
                    .catch(e => adapter.log.error(`${connection.name} - Could not init media player: ${e}`));
            }
        } // end of _networkScannerChange
    } // end of ChromecastDevice class

    return ChromecastDevice;
};
