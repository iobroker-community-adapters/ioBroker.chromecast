'use strict';
/*jshint esversion: 6 */
/*jslint node: true */

/*
 * ChromecastDevice class
 */

module.exports = function (adapter) {

    const fs = require('fs');
    const LogWrapper = require('castv2-player').LogWrapper;
    const MediaPlayer = require('castv2-player').MediaPlayer(new LogWrapper(adapter.log));
    //if (process.env.NODE_ENV !== 'production'){
    //    require('longjohn');
    //}

    const REPEAT_MODE = {
        NONE: 0,
        ALL: 1,
        ONE: 2
    };
    const PLAYER_STATE = {
        PAUSE: 0,
        PLAY: 1,
        STOP: 2
    };

    class ChromecastDevice {

        //constructor
        constructor(connection) {
            this.shuffle = false;
            this.repeat = false;

            this._connection = connection;
            this._name = connection.name.replace(/[.\s]+/g, '_');

            //Some constants
            this._NAMESPACE = adapter.namespace + '.' + this._name;

            //Create ioBroker states
            this._createObjects();

            //MEDIA PLAYER
            this._initMediaPlayer();

            //IOBROKER
            //reset status of player states
            this._updatePlayerStatus({});

            //Register for updates comming from ioBroker
            adapter.on('stateChange', this._ioBrokerChange.bind(this));

            //Register for updates comming from network scanner
            connection.registerForUpdates(this._networkScannerChange.bind(this));

        } //end of constructor


        //Media player
        _initMediaPlayer() {
            if (this._mediaPlayer !== undefined) {
                delete this._mediaPlayer;
            }

            adapter.getState(this._states.enabled.name, (err, state) => {
                if (state && !state.val) {
                    adapter.log.info(this._name + ' - not enabled');
                } else {
                    //Create media player
                    this._mediaPlayer = new MediaPlayer(this._connection);

                    //register for mediaPlayer updates
                    //client
                    this._mediaPlayer.on(this._mediaPlayer.EVENT_CLIENT_STATUS, this._updateClientStatus.bind(this));
                    this._mediaPlayer.on(this._mediaPlayer.EVENT_CLIENT_CONNECTED, this._connectedMediaPlayer.bind(this));
                    this._mediaPlayer.on(this._mediaPlayer.EVENT_CLIENT_DISCONNECTED, this._disconnectedMediaPlayer.bind(this));
                    //player
                    this._mediaPlayer.on(this._mediaPlayer.EVENT_PLAYER_STATUS, this._updatePlayerStatus.bind(this));
                    this._mediaPlayer.on(this._mediaPlayer.EVENT_PLAYER_PLAYING, this._playingPlayerStatus.bind(this));
                    this._mediaPlayer.on(this._mediaPlayer.EVENT_PLAYER_STOPPED, this._stoppedPlayerStatus.bind(this));
                }
            });
        }

        //create ioBroker states
        _createObjects() {
            let name = this._name;

            //Create a device object
            adapter.setObject(name, {
                type: 'device',
                common: {
                    name: name
                },
                native: {}
            });

            //var CHANNEL_STATUS    = name + '.status';
            const channels = {
                'status': {
                    name: name + '.status',
                    desc: 'Status channel for Chromecast device'
                },
                'player': {
                    name: name + '.player',
                    desc: 'Player channel for Chromecast device'
                },
                'playlist': {
                    name: name + '.playlist',
                    desc: 'Playlist channel for Chromecast device'
                },
                'media': {
                    name: name + '.media',
                    desc: 'Media channel for Chromecast device'
                },
                'metadata': {
                    name: name + '.metadata',
                    desc: 'Metadata channel for Chromecast device'
                },
                'exportedMedia': {
                    name: name + '.exportedMedia',
                    desc: 'Media exported via ioBroker web server'
                }
            };

            //Create/update all channel definitions
            for (const k in channels) {
                if (channels.hasOwnProperty(k)) {
                    adapter.setObject(channels[k].name, {
                        type: 'channel',
                        common: channels[k],
                        native: {}
                    });
                }
            }

            let states = {
                //Top level
                'address': {
                    name: name + '.address',
                    def: this._connection.host,
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'info.ip',
                    desc: 'Address of the Chromecast'
                },
                'port': {
                    name: name + '.port',
                    def: this._connection.host,
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'info.port',
                    desc: 'Port of the Chromecast'
                },
                'enabled': {
                    name: name + '.enabled',
                    def: true,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'switch.enable',
                    desc: 'Enable Chromecast'
                },
                //Status channel
                'connected': {
                    name: channels.status.name + '.connected',
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'indicator.reachable',
                    desc: 'ioBroker adapter connected to Chromecast. Writing to this state will trigger a disconnect followed by a connect (this might fail).'
                },
                'playing': {
                    name: channels.status.name + '.playing',
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'media.state',
                    desc: 'Player loaded. Setting to false stops play.'
                },
                'volume': {
                    name: channels.status.name + '.volume',
                    def: 1,
                    type: 'number',
                    read: true,
                    write: true,
                    role: 'level.volume',
                    unit: '%',
                    desc: 'volume in %',
                    min: 0,
                    max: 100
                },
                'muted': {
                    name: channels.status.name + '.muted',
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'media.mute',
                    desc: 'is muted?'
                },
                'isActiveInput': {
                    name: channels.status.name + '.isActiveInput',
                    def: true,
                    type: 'boolean',
                    read: true,
                    write: false,
                    role: 'media.input',
                    desc: '(HDMI only) TV is set to use Chromecast as input'
                },
                'isStandBy': {
                    name: channels.status.name + '.isStandBy',
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: false,
                    role: 'info.standby',
                    desc: '(HDMI only) TV is standby'
                },
                'displayName': {
                    name: channels.status.name + '.displayName',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'info.name',
                    desc: 'Chromecast player display name'
                },
                'statusText': {
                    name: channels.status.name + '.text',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'info.status',
                    desc: 'Chromecast player status as text'
                },
                //Player channel
                'url2play': {
                    name: channels.player.name + '.url2play',
                    def: '',
                    type: 'string',
                    read: true,
                    write: true,
                    role: 'media.url',
                    desc: 'URL this the chromecast should play from'
                },
                'announcement': {
                    name: channels.player.name + '.announcement',
                    def: '',
                    type: 'string',
                    read: true,
                    write: true,
                    role: 'media.url.announcement',
                    desc: 'URL for an announcement to play now. Current playlist (if any) will be resumed afterwards'
                },
                'stop': {
                    name: channels.player.name + '.stop',
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.stop',
                    desc: 'Stop playing'
                },
                'pause': {
                    name: channels.player.name + '.pause',
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.pause',
                    desc: 'Pause playing'
                },
                'play': {
                    name: channels.player.name + '.play',
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.play',
                    desc: 'Resume playing'
                },
                'next': {
                    name: channels.player.name + '.next',
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.next',
                    desc: 'Next title'
                },
                'prev': {
                    name: channels.player.name + '.prev',
                    type: 'boolean',
                    read: false,
                    write: true,
                    role: 'button.prev',
                    desc: 'Previous title'
                },
                'state': {
                    name: channels.player.name + '.state',
                    def: '',
                    type: 'number',
                    states: {1: 'play', 2: 'stop', 0: 'pause'},
                    read: true,
                    write: false,
                    role: 'media.state',
                    desc: 'Player status play/stop/pause'
                },
                // It could be nice, if this state will be deleted
                'playerState': {
                    name: channels.player.name + '.playerState',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'state',
                    desc: 'Player status'
                },
                // It could be nice, if this state will be deleted
                'paused': {
                    name: channels.player.name + '.paused',
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'switch',
                    desc: 'is paused?'
                },
                'currentTime': {
                    name: channels.player.name + '.currentTime',
                    def: 0,
                    type: 'number',
                    read: true,
                    write: false,
                    role: 'media.elapsed',
                    desc: 'Playing time?',
                    unit: 's'
                },
                'playerVolume': {
                    name: channels.player.name + '.volume',
                    def: 1,
                    type: 'number',
                    read: true,
                    write: true,
                    role: 'level.volume',
                    unit: '%',
                    min: 0,
                    max: 100,
                    desc: 'Player volume in %'
                },
                'playerMuted': {
                    name: channels.player.name + '.muted',
                    def: false,
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'media.mute',
                    desc: 'Player is muted?'
                },
                //Playlist channel
                'playlist': {
                    name: channels.playlist.name + '.list',
                    def: [],
                    type: 'array',
                    read: true,
                    write: false,
                    role: 'media.playlist',
                    desc: 'Json array with the playlist'
                },
                'currentItemId': {
                    name: channels.playlist.name + '.currentItemId',
                    def: [],
                    type: 'number',
                    read: true,
                    write: false,
                    role: 'media.track',
                    desc: 'ItemId of element being played'
                },
                'jump': {
                    name: channels.playlist.name + '.jump',
                    def: 0,
                    type: 'number',
                    read: false,
                    write: true,
                    role: 'command',
                    desc: 'Number of items to jump in the playlist (it can be negative)'
                },
                'repeatMode': {
                    name: channels.player.name + '.repeatMode',
                    def: '',
                    type: 'number',
                    states: {0: 'none', 1: 'all', 2: 'one'},
                    read: true,
                    write: true,
                    role: 'media.mode.repeat',
                    desc: 'repeat mode for playing media'
                },
                'shuffleMode': {
                    name: channels.player.name + '.shuffleMode',
                    def: '',
                    type: 'boolean',
                    read: true,
                    write: true,
                    role: 'media.mode.shuffle',
                    desc: 'shuffle mode for playing media (only together with repeat mode all)'
                },
                //Media channel
                'streamType': {
                    name: channels.media.name + '.streamType',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'state',
                    desc: 'Type of stream being played - LIVE or BUFFERED'
                },
                'duration': {
                    name: channels.player.name + '.duration',
                    def: -1,
                    type: 'number',
                    read: true,
                    write: false,
                    role: 'media.duration',
                    unit: 's',
                    desc: 'Duration of media being played'
                },
                'contentType': {
                    name: channels.media.name + '.contentType',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.content',
                    desc: 'Type of media being played such as audio/mp3'
                },
                'contentId': {
                    name: channels.media.name + '.contentId',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'state',
                    desc: 'id of content being played. Usually the URL.'
                },
                //Metadata channel
                'title': {
                    name: channels.player.name + '.title',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.title',
                    desc: 'Title'
                },
                'album': {
                    name: channels.player.name + '.album',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.album',
                    desc: 'Album'
                },
                'artist': {
                    name: channels.player.name + '.artist',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.artist',
                    desc: 'Artist'
                },
                'broadcastDate': {
                    name: channels.player.name + '.broadcastDate',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.date',
                    desc: 'Broadcast date'
                },
                'seasonNumber': {
                    name: channels.player.name + '.seasonNumber',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.season',
                    desc: 'Season number'
                },
                'episodeNumber': {
                    name: channels.player.name + '.episodeNumber',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.episode',
                    desc: 'Episode number'
                },
                'trackNumber': {
                    name: channels.player.name + '.trackNumber',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.track',
                    desc: 'Track number'
                },
                'cover': {
                    name: channels.player.name + '.cover',
                    def: '',
                    type: 'string',
                    read: true,
                    write: false,
                    role: 'media.cover',
                    desc: 'Cover URI'
                },
                //Exported media
                'exportedMedia': {
                    name: channels.exportedMedia.name + '.mp3',
                    type: 'file',
                    read: true,
                    write: false,
                    role: 'media.link',
                    desc: 'Can be accessed from web server under http://ip:8082/state/chromecast.0.<device name>.exportedMedia.mp3'
                }
            };

            //Keep a reference to states in the class
            this._states = states;

            //Delete legacy states
            adapter.deleteState(channels.player.name + '.jump');
            adapter.deleteState(channels.player.name + '.repeatMode');

            //Create/update all state definitions
            for (let k in states) {
                if (states.hasOwnProperty(k)) {
                    adapter.setObject(states[k].name, {
                        type: 'state',
                        common: states[k],
                        native: {}
                    });
                }
            }

            //Set some objects
            this._updateMediaPlayerConnection(this._connection);
            this._disconnectedMediaPlayer();
            this._stoppedPlayerStatus();

            //Set enabled only if not set already
            adapter.getState(states.enabled.name,
                (err, state) => !state && adapter.setState(states.enabled.name, {val: true, ack: true}));

            //Set url2play only if not set already
            adapter.getState(states.url2play.name, (err, state) =>
                    !state && adapter.setState(states.url2play.name, {val: 'http:/example.org/playme.mp3', ack: true}));

        } // END of createObjects

        setStateIfChanged(id, val, oldVal) {
            // if same value
            if (oldVal !== undefined && oldVal === val.val) {
                return;
            }

            adapter.getState(id, (err, state) => {
                if (err) {
                    adapter.log.error(this._name + ' - Could not get ' + id + ':' + err);
                } else {
                    if (!state) {
                        adapter.setState(id, val);
                    } else if (
                        val.val !== state.val ||
                        val.ack !== state.ack) {
                        adapter.setState(id, val);
                    } else {
                        adapter.log.debug(this._name + ' - ' + id + ' value unchanged -> SKIP');
                    }
                }
            });
        }

        /*
         * MediaPlayer methods
         */

        _updateMediaPlayerConnection(connection) {
            adapter.setState(this._states.address.name, {val: connection.host, ack: true});
            adapter.setState(this._states.port.name,    {val: connection.port, ack: true});
        }

        _disconnectedMediaPlayer() {
            //Set connected status to false
            adapter.setState(this._states.connected.name, {val: false, ack: true});
        }

        _connectedMediaPlayer() {
            //Set playing and connected status to false
            adapter.setState(this._states.connected.name, {val: true, ack: true});
        }

        _updateClientStatus(status, previousStatus) {
            //Volume
            adapter.setState(this._states.volume.name, {val: this._mediaPlayer.getVolume(), ack: true});
            adapter.setState(this._states.muted.name,  {val: this._mediaPlayer.isMuted(), ack: true});

            //Video Chromecast-only
            adapter.setState(this._states.isActiveInput.name, {
                val: ('isActiveInput' in status ? status.isActiveInput : true),
                ack: true
            });
            adapter.setState(this._states.isStandBy.name, {
                val: ('isStandBy' in status ? status.isStandBy : false),
                ack: true
            });

            if (status.hasOwnProperty('applications')) {
                let currentApplicationObject = status.applications[0];

                adapter.setState(this._states.displayName.name, {
                    val: ('displayName' in currentApplicationObject ? currentApplicationObject.displayName : ''),
                    ack: true
                });
                adapter.setState(this._states.statusText.name, {
                    val: ('statusText' in currentApplicationObject ? currentApplicationObject.statusText : ''),
                    ack: true
                });
            }
        }


        /*
         * Player methods
         */

        _playingPlayerStatus() {
            adapter.setState(this._states.playing.name, {val: true, ack: true});
        }

        _stoppedPlayerStatus() {
            adapter.setState(this._states.playing.name, {val: false, ack: true});
        }

        static chromecastPlayerState2IobState(chState, pause) {
            return chState === 'stop' ? PLAYER_STATE.STOP :
                (chState === 'play' && pause ? PLAYER_STATE.pause : PLAYER_STATE.PLAY)
        }

        static chromecastRepeat2IobRepeat(chState) {
            return chState === 'REPEAT_ALL' || chState === 'REPEAT_ALL_AND_SHUFFLE' ? REPEAT_MODE.ALL :
                (chState === 'REPEAT_SINGLE' ? REPEAT_MODE.ONE : REPEAT_MODE.NONE);
        }

        _updatePlayerStatus(pStatus, pPreviousStatus) {
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
            //adapter.log.info(name + ' - Player status: ' + JSON.stringify(pStatus));

            //Player channel status
            let status = pStatus ? pStatus : {};
            let cachedStatus = pPreviousStatus ? pPreviousStatus : {};

            //playerState
            let playerState = status.playerState ? status.playerState.toLowerCase() : 'stop';
            let cachedPlayerState = cachedStatus.playerState ? cachedStatus.playerState.toLocaleString() : 'stop';
            this.setStateIfChanged(this._states.playerState.name,
                {val: playerState, ack: true},
                cachedPlayerState);

            // paused
            let pause = status.playerState === 'PAUSED';
            this.setStateIfChanged(this._states.paused.name,
                {val: pause, ack: true},
                cachedStatus.playerState === 'PAUSED');

            // state
            let state = ChromecastDevice.chromecastPlayerState2IobState((status.playerState && status.playerState.toLowerCase() || 'stop'), pause);
            this.setStateIfChanged(this._states.state.name, {val: state, ack: true});

            // currentTime
            this.setStateIfChanged(this._states.currentTime.name,
                {val: Math.floor(status.currentTime), ack: true},
                Math.floor(cachedPlayerState.currentTime));

            // Playlist
            if (status.items &&
                status.items.length > 0 &&
                status.items[0] &&
                status.items[0].media) {
                this.setStateIfChanged(this._states.playlist.name,
                    {val: JSON.stringify(status.items), ack: true},
                    JSON.stringify(cachedStatus.items));
            } else {
                //Uncompleted status - trigger a new one - this happens after the playlist starts again
                if (this._mediaPlayer !== undefined) this._mediaPlayer.getStatusPromise();
            }

            //Current Item Id
            this.setStateIfChanged(this._states.currentItemId.name,
                {val: status.currentItemId, ack: true},
                cachedStatus.currentItemId);

            //repeatMode
            this.repeat = ChromecastDevice.chromecastRepeat2IobRepeat(status.repeatMode);
            this.setStateIfChanged(this._states.repeatMode.name,
                {val: this.repeat, ack: true},
                ChromecastDevice.chromecastRepeat2IobRepeat(cachedStatus.repeatMode));

            this.shuffle = status.shuffleMode === 'REPEAT_ALL_AND_SHUFFLE';
            this.setStateIfChanged(this._states.shuffleMode.name,
                {val: this.shuffle, ack: true},
                cachedStatus.shuffleMode === 'REPEAT_ALL_AND_SHUFFLE');

            //volume
            this.setStateIfChanged(this._states.playerVolume.name,
                {val: Math.round(('volume' in status ? status.volume.level : 1) * 100), ack: true},
                Math.round(('volume' in cachedStatus ? cachedStatus.volume.level : 1) * 100));

            //muted
            this.setStateIfChanged(this._states.playerMuted.name,
                {val: ('volume' in status ? status.volume.muted : false), ack: true},
                ('volume' in cachedStatus ? cachedStatus.volume.muted : false));

            //Media channel status
            let media = status.media ? status.media : {};
            let cachedMedia = cachedStatus.media ? cachedStatus.media : {};

            //streamType
            this.setStateIfChanged(this._states.streamType.name,
                {val: media.streamType || '', ack: true},
                cachedMedia.streamType || '');

            //duration
            this.setStateIfChanged(this._states.duration.name,
                {val: media.duration || 0, ack: true},
                cachedMedia.duration || 0);

            //contentType
            this.setStateIfChanged(this._states.contentType.name,
                {val: media.contentType || '', ack: true},
                cachedMedia.contentType || '');

            //contentId
            this.setStateIfChanged(this._states.contentId.name,
                {val: media.contentId || '', ack: true},
                cachedMedia.contentId || '');

            //Metadata channel status
            let metadata = media.metadata ? media.metadata : {};
            let cachedMetadata = cachedMedia.metadata ? cachedMedia.metadata : {};

            // title
            this.setStateIfChanged(this._states.title.name,
                {val: metadata.title || '', ack: true},
                cachedMetadata.title || '');

            // album
            this.setStateIfChanged(this._states.album.name,
                {val: metadata.albumName || '', ack: true},
                cachedMetadata.albumName || '');

            // artist
            this.setStateIfChanged(this._states.artist.name,
                {val: metadata.artist || '', ack: true},
                cachedMetadata.artist || '');

            // image
            this.setStateIfChanged(this._states.cover.name,
                {val: (metadata.images &&  metadata.images[0] &&  metadata.images[0].url) || '', ack: true},
                (cachedMetadata.images && cachedMetadata.images[0] && cachedMetadata.images[0].url) || '');
            // broadcast date
            this.setStateIfChanged(this._states.broadcastDate.name,
                {val: metadata.broadcastDate || '', ack: true},
                cachedMetadata.broadcastDate || '');
            // Season number
            this.setStateIfChanged(this._states.seasonNumber.name,
                {val: metadata.seasonNumber || '', ack: true},
                cachedMetadata.seasonNumber || '');
            // Episode number
            this.setStateIfChanged(this._states.episodeNumber.name,
                {val: metadata.episodeNumber || '', ack: true},
                cachedMetadata.episodeNumber || '');
            // Track number
            this.setStateIfChanged(this._states.trackNumber.name,
                {val: metadata.trackNumber || '', ack: true},
                cachedMetadata.trackNumber || '');
        }


        _playURL(url2play, org_url2play, streamType) {
            if (org_url2play === undefined)
                org_url2play = url2play;

            //Assume live stream by default
            if (streamType === undefined)
                streamType = 'LIVE';

            if (url2play.indexOf('http') !== 0) {
                //Not an http(s) URL -> assume local file
                adapter.log.info('%s - Not a http(s) URL -> asume local file for %s', this._name, url2play);

                //Check this the webserver has been configured
                if (adapter.config.webServer === '') {
                    adapter.log.error(this._name + '- Sorry, cannot play file "' + url2play + '"');
                    adapter.log.error(this._name + '- Please configure webserver settings first!');
                    return;
                }

                let exported_file_state = adapter.namespace + '.' + this._states.exportedMedia.name;
                //Try to load in a local state
                try {
                    adapter.setBinaryState(exported_file_state, fs.readFileSync(url2play), err => {
                        if (err) {
                            adapter.log.error(this._name + ' - Cannot store file "' + url2play + '" into ' + exported_file_state + ': ' + err.toString());
                            return;
                        }

                        //Calculate the exported URL
                        url2play = 'http://' + adapter.config.webServer + ':8082/state/' + exported_file_state;
                        adapter.log.info('Exported as ' + url2play);
                        this._playURL(url2play, org_url2play, 'BUFFERED');
                    });
                } catch (err) {
                    adapter.log.error(this._name + ' - Cannot play file "' + url2play + '": ' + err.toString());
                }
                return;
            }

            this._mediaPlayer.playUrlPromise(url2play /*org_url2play, streamType*/)
                .then(() => {
                    adapter.setState(this._states.url2play.name, {val: org_url2play, ack: true});
                })
                .catch(err => {
                    adapter.log.error(this._name + ' - Cannot play file "' + url2play + '": ' + err.toString());
                });
        }


        // is called if a subscribed state changes
        _ioBrokerChange(id, state) {
            let states = this._states;
            let name = this._name;

            if ((id.indexOf(this._NAMESPACE) !== 0) ||
                !state ||
                // you can use the ack flag to detect if it is status (true) or command (false)
                state.ack ||
                !state.from ||
                state.from.startsWith(adapter.namespace)
            ) {
                return;
            }

            id = id.substring(adapter.namespace.length + 1);

            // Warning, state can be null if it was deleted
            adapter.log.debug(name + ' - device stateChange ' + id + ' ' + JSON.stringify(state));

            //Is enabled
            if (id === states.enabled.name) {
                this._initMediaPlayer();
                adapter.setState(id, {val: state.val, ack: true});
                return;
            }
            //is adapter disabled?
            else if (this._mediaPlayer === undefined) {
                adapter.log.info(name + ' - adapter disabled - ignoring  stateChange ' + id + ' ' + JSON.stringify(state));
                return;
            }
            //Is volume?
            if (id === states.volume.name) {
                this._mediaPlayer.setVolumePromise(state.val)
                //ACK written when status update sent by Chromecast
                    .catch(err => adapter.log.error(name + ' - ' + err));
            }
            //Is muted?
            else if (id === states.muted.name) {
                if (state.val) {
                    //mute
                    this._mediaPlayer.mutePromise()
                    //ACK written when status update sent by Chromecast
                        .catch(err =>adapter.log.error(name + ' - Could not mute: ' + err));
                } else {
                    //unmute
                    this._mediaPlayer.unmutePromise()
                    //ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(name + ' - Could not unmute: ' + err));
                }
            }
            //Is playing?
            else if (id === states.playing.name) {
                if (state.val) {
                    //Try to play last contentID
                    adapter.getState(states.contentId.name, (err, state) => {
                        if (state && state.val && state.val.startsWith('http')) {
                            this._playURL(state.val);
                        } else {
                            //Try to play last url2play
                            adapter.getState(states.url2play.name, (err, state) => {
                                if (state && state.val && state.val.startsWith('http')) {
                                    this._playURL(state.val);
                                } else {
                                    //Could not find a valid link to play -> set to false again
                                    adapter.setState(id, false);
                                }
                            });
                        }
                    });
                } else {
                    this._mediaPlayer.stopPromise()
                    //ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(name + ' - Could not stop: ' + err));
                }
            }
            // Is pause
            else if (id === states.pause.name) {
                this._mediaPlayer.pausePromise()
                //ACK written when status update sent by Chromecast
                    .catch(err => adapter.log.error(name + ' - Could not pause: ' + err));
            }
            // Is play
            else if (id === states.play.name) {
                this._mediaPlayer.playPromise()
                //ACK written when status update sent by Chromecast
                    .catch(err => adapter.log.error(name + ' - Could not play: ' + err));
            }
            // Is stop
            else if (id === states.stop.name) {
                this._mediaPlayer.stopPromise()
                //ACK written when status update sent by Chromecast
                    .catch(err => adapter.log.error(name + ' - Could not stop: ' + err));
            }
            //Is paused?
            else if (id === states.paused.name) {
                if (state.val) {
                    this._mediaPlayer.pausePromise()
                    //ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(name + ' - Could not pause: ' + err));
                } else {
                    this._mediaPlayer.playPromise()
                    //ACK written when status update sent by Chromecast
                        .catch(err => adapter.log.error(name + ' - Could not resume: ' + err));
                }
            }
            // Next
            else if (id === states.next.name) {
                this._mediaPlayer.jumpInPlaylistPromise(1)
                    .then(() => adapter.log.debug('Next done.'))
                    .catch(err => adapter.log.error(name + ' - Could not execute next: ' + err));
            }
            // Prev
            else if (id === states.prev.name) {
                this._mediaPlayer.jumpInPlaylistPromise(-1)
                    .then(() => adapter.log.debug('Prev done.'))
                    .catch(err => adapter.log.error(name + ' - Could not execute prev: ' + err));
            }            //Is jump?
            else if (id === states.jump.name) {
                this._mediaPlayer.jumpInPlaylistPromise(state.val)
                    .then(() => adapter.setState(id, {val: state.val, ack: true}))
                    .catch(err => adapter.log.error(name + ' - Could not jump: ' + err));
            }
            //Is repeatMode?
            else if (id === states.repeatMode.name) {
                state.val = parseInt(state.val, 10);
                this.repeat = state.val;

                this._mediaPlayer.setRepeatModePromise(state.val === REPEAT_MODE.ALL || state.val === 'all' ? (this.shuffle ? 'REPEAT_ALL_AND_SHUFFLE' : 'REPEAT_ALL') : (state.val === REPEAT_MODE.ONE || state.val === 'one' ? 'REPEAT_SINGLE' : 'REPEAT_OFF'))
                //ACK written when status update sent by Chromecast
                    .catch(err => adapter.log.error(name + ' - Could not set repeatMode: ' + err));
            }
            //Is repeatAllShuffle?
            else if (id === states.shuffleMode.name) {
                if (state.val) {
                    state.val = 'REPEAT_ALL_AND_SHUFFLE';
                    this.shuffle = true;
                    this.setStateIfChanged(this._states.repeatMode.name, {val: 1, ack: true}, this.repeat);
                } else {
                    this.shuffle = false;
                    if (this.repeat === REPEAT_MODE.ALL) {
                        state.val = 'REPEAT_ALL';
                    } else if (this.repeat === REPEAT_MODE.ONE) {
                        state.val = 'REPEAT_SINGLE';
                    } else {
                        state.val = 'REPEAT_OFF';
                    }
                    this.setStateIfChanged(this._states.repeatMode.name, {val: state.val, ack: true}, this.repeat);
                }
                this._mediaPlayer.setRepeatModePromise(state.val)
                //ACK written when status update sent by Chromecast
                    .catch(err => adapter.log.error(name + ' - Could not repeatAllShuffle: ' + err));
            }
            //Is announcement?
            else if (id === states.announcement.name) {
                this._mediaPlayer.playAnnouncementPromise(state.val)
                    .then(() => adapter.setState(id, {val: state.val, ack: true}))
                    .catch(err => adapter.log.error(name + ' - Could not play announcement: ' + err));
            }
            //Is url2play?
            else if (id === states.url2play.name) {
                this._playURL(state.val);
            } else {
                //Unsupported state change
                adapter.log.error(name + ' - Sorry, update for ' + id + ' not supported!');
            }

        } // end of _ioBrokerChange

        _networkScannerChange (connection) {
          adapter.log.debug(connection.name + ' - refreshing connection');
          if (this._mediaPlayer !== undefined) {
              this._mediaPlayer.updateDevice(connection);
          } else {
            this._initMediaPlayer();
          }
        } // end of _networkScannerChange

    } // end of ChromecastDevice class

    return ChromecastDevice;
};
