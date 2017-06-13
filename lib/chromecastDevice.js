"use strict";
/*jshint esversion: 6 */
/*jslint node: true */

/* 
 * ChromecastDevice class
 */

module.exports = function (adapter) {

  var fs                = require('fs');
  var LogWrapper        = require('castv2-player').LogWrapper;
  var MediaPlayer       = require('castv2-player').MediaPlayer(new LogWrapper(adapter.log));
  //if (process.env.NODE_ENV !== 'production'){
  //    require('longjohn');
  //}
  

  class ChromecastDevice {

    //constructor
    constructor (connection) {
    
      let that = this;

      that._name    = connection.name.replace(/[.\s]+/g, '_');

      //Some constants
      that._NAMESPACE = adapter.namespace + "." + that._name; 

      //MEDIA PLAYER
      //Create media player
      that._mediaPlayer = new MediaPlayer(connection);
      
      //register for mediaPlayer updates
      //client
      that._mediaPlayer.on(that._mediaPlayer.EVENT_CLIENT_STATUS,       that._updateClientStatus.bind(that));
      that._mediaPlayer.on(that._mediaPlayer.EVENT_CLIENT_CONNECTED,    that._connectedMediaPlayer.bind(that));
      that._mediaPlayer.on(that._mediaPlayer.EVENT_CLIENT_DISCONNECTED, that._disconnectedMediaPlayer.bind(that));
      //player
      that._mediaPlayer.on(that._mediaPlayer.EVENT_PLAYER_STATUS,       that._updatePlayerStatus.bind(that));
      that._mediaPlayer.on(that._mediaPlayer.EVENT_PLAYER_PLAYING,      that._playingPlayerStatus.bind(that));
      that._mediaPlayer.on(that._mediaPlayer.EVENT_PLAYER_STOPPED,      that._stoppedPlayerStatus.bind(that));

      //IOBROKER
      //Create ioBroker states
      that._createObjects();

      //reset status of player states
      that._updatePlayerStatus({});

      //Register for updates comming from ioBroker
      adapter.on('stateChange', that._ioBrokerChange.bind(that));

    } //end of constructor
        

    //create ioBroker states
    _createObjects()
    {
      let that = this;
    
      let name = that._name;

      //Create a device object
      adapter.setObject(name, {
        type: 'device',
        common: {
          name: name
        },
        native: {}
      });

      var CHANNEL_STATUS    = name + '.status';
      var channels = {
        'status': {
          name:   name + '.status',
          desc:   'Status channel for Chromecast device'
        },
        'player': {
          name:   name + '.player',
          desc:   'Player channel for Chromecast device'
        },
        'playlist': {
          name:   name + '.playlist',
          desc:   'Playlist channel for Chromecast device'
        },
        'media': {
          name:   name + '.media',
          desc:   'Media channel for Chromecast device'
        },
        'metadata': {
          name:   name + '.metadata',
          desc:   'Metadata channel for Chromecast device'
        },
        'exportedMedia': {
          name:   name + '.exportedMedia',
          desc:   'Media exported via ioBroker web server'
        }
      };

      //Create/update all channel definitions
      for (let k in channels) {
        adapter.setObject(channels[k].name, {
          type: 'channel',
          common: channels[k],
          native: {}
        });
      }
      
      let states = {
        //Top level
        'address': {
          name:   name + '.address',
          def:    that._mediaPlayer.connection.host,
          type:   'string',
          read:   true,
          write:  false,
          role:   'address',
          desc:   'Address of the Chromecast'
        },
        'port': {
          name:   name + '.port',
          def:    that._mediaPlayer.connection.host,
          type:   'string',
          read:   true,
          write:  false,
          role:   'port',
          desc:   'Port of the Chromecast'
        },
        //Status channel
        'connected': {
          name:   channels.status.name + '.connected',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'ioBroker adapter connected to Chromecast. Writing to this state will trigger a disconnect followed by a connect (that might fail).'
        },
        'playing': {
          name:   channels.status.name + '.playing',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'Player loaded. Setting to false stops play.'
        },
        'volume': {
          name:   channels.status.name + '.volume',
          def:    1,
          type:   'number',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'volume in %',
          min:    0,
          max:    100
        },
        'muted': {
          name:   channels.status.name + '.muted',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'is muted?'
        },
        'isActiveInput': {
          name:   channels.status.name + '.isActiveInput',
          def:    true,
          type:   'boolean',
          read:   true,
          write:  false,
          role:   'status',
          desc:   '(HDMI only) TV is set to use Chromecast as input'
        },
        'isStandBy': {
          name:   channels.status.name + '.isStandBy',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  false,
          role:   'status',
          desc:   '(HDMI only) TV is standby'
        },
        'displayName': {
          name:   channels.status.name + '.displayName',
          def:    "",
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Chromecast player display name'
        },
        'statusText': {
          name:   channels.status.name + '.text',
          def:    "",
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Chromecast player status as text'
        },
        //Player channel
        'url2play': {
          name:   channels.player.name + '.url2play',
          def:    '',
          type:   'string',
          read:   true,
          write:  true,
          role:   'command',
          desc:   'URL that the chomecast should play from'
        },
        'announcement': {
          name:   channels.player.name + '.announcement',
          def:    '',
          type:   'string',
          read:   true,
          write:  true,
          role:   'command',
          desc:   'URL for an announcement to play now. Current playlist (if any) will be resumed afterwards'
        },
        'playerState': {
          name:   channels.player.name + '.playerState',
          def:    '',
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Player status'
        },
        'paused': {
          name:   channels.player.name + '.paused',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'is paused?'
        },
        'currentTime': {
          name:   channels.player.name + '.currentTime',
          def:    0,
          type:   'number',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Playing time?',
          unit:   's'
        },
        'playerVolume': {
          name:   channels.player.name + '.volume',
          def:    1,
          type:   'number',
          read:   true,
          write:  true,
          role:   'status',
          min:    0,
          max:    100,
          desc:   'Player volume in %'
        },
        'playerMuted': {
          name:   channels.player.name + '.muted',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'Player is muted?'
        },
        //Playlist channel
        'playlist': { 
          name:   channels.playlist.name + '.raw',
          def:    [],
          type:   'array',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Json array with the playlist'
        },
        'currentItemId': {
          name:   channels.playlist.name + '.currentItemId',
          def:    [],
          type:   'number',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'ItemId of element being played'
        },
        'jump': {
          name:   channels.playlist.name + '.jump',
          def:    0,
          type:   'number',
          read:   false,
          write:  true,
          role:   'command',
          desc:   'Number of items to jump in the playlist (it can be negative)'
        },
        'repeatMode': {
          name:   channels.playlist.name + '.repeatMode',
          def:    '',
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'repeat mode for playing media'
        },
        'repeatOff': {
          name:   channels.playlist.name + '.repeatOff',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'Items are played in order, and when the queue is completed (the last item has ended) the media session is terminated.'
        },
        'repeatAll': {
          name:   channels.playlist.name + '.repeatAll',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'The items in the queue will be played indefinitely. When the last item has ended, the first item will be played again.'
        },
        'repeatAllShuffle': {
          name:   channels.playlist.name + '.repeatAllShuffle',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'The items in the queue will be played indefinitely. When the last item has ended, the list of items will be randomly shuffled by the receiver, and the queue will continue to play starting from the first item of the shuffled items.'
        },
        'repeatSingle': {
          name:   channels.playlist.name + '.repeatSingle',
          def:    false,
          type:   'boolean',
          read:   true,
          write:  true,
          role:   'status',
          desc:   'The current item will be repeated indefinitely.'
        },
        //Media channel
        'streamType': {
          name:   channels.media.name + '.streamType',
          def:    '',
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Type of stream being played - LIVE or BUFFERED'
        },
        'duration': {
          name:   channels.media.name + '.duration',
          def:    -1,
          type:   'number',
          read:   true,
          write:  false,
          role:   'status',
          unit:   's',
          desc:   'Duration of media being played'
        },
        'contentType': {
          name:   channels.media.name + '.contentType',
          def:    '',
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Type of media being played such as audio/mp3'
        },
        'contentId': {
          name:   channels.media.name + '.contentId',
          def:    '',
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'id of content being played. Usally the URL.'
        },
        //Metadata channel
        'title': {
          name:   channels.metadata.name + '.title',
          def:    '',
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Title'
        },
        'album': {
          name:   channels.metadata.name + '.album',
          def:    '',
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Album'
        },
        'artist': {
          name:   channels.metadata.name + '.artist',
          def:    '',
          type:   'string',
          read:   true,
          write:  false,
          role:   'status',
          desc:   'Artist'
        },
        //Exported media
        'exportedMedia': {
          name:   channels.exportedMedia.name + '.mp3',
          type:   'object',
          read:   true,
          write:  false,
          role:   'web',
          desc:   'Can be accessed from web server under http://ip:8082/state/chromecast.0.<device name>.exportedMedia.mp3'
        }
      };
      
      //Keep a reference to states in the class
      that._states = states;

      //Delete legacy states
      adapter.deleteState(channels.player.name + '.jump');
      adapter.deleteState(channels.player.name + '.repeatMode');

      //Create/update all state definitions
      for (let k in states) {
        adapter.setObject(states[k].name, {
          type: 'state',
          common: states[k],
          native: {}
        });
      }

      //Set some objects
      that._updateMediaPlayerConnection(that._mediaPlayer.connection);
      that._disconnectedMediaPlayer();
      that._stoppedPlayerStatus();
      
      //Set url2play only if not set already
      adapter.getState(states.url2play.name, function (err, state) {
        if (!state) {
          adapter.setState(states.url2play.name,   {val: "http:/example.org/playme.mp3", ack: true});
        }
      });
      
    } // END of createObjects
  
    setStateIfChanged(id, val, oldVal)
    {
      let that = this;
      
      if (oldVal == val.val)
        //same value
        return;

      adapter.getState(id, function (err, state) {
        if (err) {
          adapter.log.error(that._name + ' - Could not get ' + id + ':' + err);
        } else {
          if (!state) {
            adapter.setState(id, val);
          } else if (val != state.val) {
            adapter.setState(id, val);
          } else if (
            (val.val != state.val) ||
            (val.ack != state.ack))
          {
            adapter.setState(id, val);
          } else {
            adapter.log.debug(that._name + ' - ' + id + ' value unchanged -> SKIP');
          }
        }

      });
    }
    
    
    
    /*
     * MediaPlayer methods
     */
     
    _updateMediaPlayerConnection (connection)
    {
      let that = this;
      
      adapter.setState(that._states.address.name,   {val: that._mediaPlayer.connection.host, ack: true});
      adapter.setState(that._states.port.name,      {val: that._mediaPlayer.connection.port, ack: true});
    }
    
    _disconnectedMediaPlayer()
    {
      let that = this;
        
      //Set connected status to false      
      adapter.setState(that._states.connected.name, {val: false, ack: true});
    }
    
    _connectedMediaPlayer()
    {
      let that = this;
        
      //Set playing and connected status to false
      adapter.setState(that._states.connected.name, {val: true, ack: true});
    }
    
    
    _updateClientStatus (status, previousStatus)
    {
      let that = this;
      
      //Volume
      adapter.setState(that._states.volume.name, {val: that._mediaPlayer.getVolume(), ack: true});
      adapter.setState(that._states.muted.name,  {val: that._mediaPlayer.isMuted(),   ack: true});
      
      //Video Chromecast-only
      adapter.setState(that._states.isActiveInput.name, {val: ("isActiveInput" in status ? status.isActiveInput: true),  ack: true});
      adapter.setState(that._states.isStandBy.name,     {val: ("isStandBy"     in status ? status.isStandBy    : false), ack: true});
      
      if ("applications" in status)
      {
        let currentApplicationObject = status.applications[0]; 
            
        adapter.setState(that._states.displayName.name, {val: ("displayName" in currentApplicationObject ? currentApplicationObject.displayName: ""), ack: true});
        adapter.setState(that._states.statusText.name,  {val: ("statusText"  in currentApplicationObject ? currentApplicationObject.statusText:  ""), ack: true});
      }
    }
    
    
    
    /*
     * Player methods
     */
    
    _playingPlayerStatus ()
    {    
      let that = this;
      
      adapter.setState(that._states.playing.name, {val: true, ack: true});
    }
    
    _stoppedPlayerStatus ()
    {    
      let that = this;
      
      adapter.setState(that._states.playing.name, {val: false, ack: true});
    }
    

    _updatePlayerStatus (pStatus, pPreviousStatus)
    {
      let that = this;
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
      let status        = pStatus         ? pStatus :         {};
      let cachedStatus  = pPreviousStatus ? pPreviousStatus : {};
      
      //playerState
      let playerState       = status.playerState        ? status.playerState :        "STOP";
      let cachedPlayerState = cachedStatus.playerState  ? cachedStatus.playerState :  "STOP";
      that.setStateIfChanged (that._states.playerState.name,
                              {val: playerState, ack: true},
                              cachedPlayerState);
                        
      //currentTime
      that.setStateIfChanged(that._states.currentTime.name,
                             {val: Math.floor(status.currentTime), ack: true},
                             Math.floor(cachedPlayerState.currentTime));
      
      //paused
      that.setStateIfChanged(that._states.paused.name,
                             {val: (status.playerState == "PAUSED"), ack: true},
                             (cachedStatus.playerState == "PAUSED"));

      //Playlist
      if (status.items &&
          status.items.length > 0 &&
          status.items[0].media) {
        that.setStateIfChanged(that._states.playlist.name,
                               {val: JSON.stringify(status.items), ack: true},
                               JSON.stringify(cachedStatus.items));
      } else {
        //Uncompleted status - trigger a new one - this happens after the playlist starts again
        that._mediaPlayer.getStatusPromise();
      }


      //Current Item Id
      that.setStateIfChanged(that._states.currentItemId.name,
                             {val: status.currentItemId, ack: true},
                             cachedStatus.currentItemId);
      
      //repeatMode
      that.setStateIfChanged(that._states.repeatMode.name,
                             {val: status.repeatMode, ack: true},
                             cachedStatus.repeatMode);
      that.setStateIfChanged(that._states.repeatOff.name,
                             {val: (status.repeatMode  == "REPEAT_OFF"), ack: true},
                             (cachedStatus.repeatMode  == "REPEAT_OFF"));
      that.setStateIfChanged(that._states.repeatAll.name,
                             {val: (status.repeatMode  == "REPEAT_ALL"), ack: true},
                             (cachedStatus.repeatMode  == "REPEAT_ALL"));
      that.setStateIfChanged(that._states.repeatAllShuffle.name,
                             {val: (status.repeatMode  == "REPEAT_ALL_AND_SHUFFLE"), ack: true},
                             (cachedStatus.repeatMode  == "REPEAT_ALL_AND_SHUFFLE"));
      that.setStateIfChanged(that._states.repeatSingle.name,
                             {val: (status.repeatMode  == "REPEAT_SINGLE"), ack: true},
                             (cachedStatus.repeatMode  == "REPEAT_SINGLE"));

      
      //volume
      that.setStateIfChanged(that._states.playerVolume.name,
                             {val: Math.round(("volume" in status ? status.volume.level : 1) * 100), ack: true},
                             Math.round(("volume" in cachedStatus ? cachedStatus.volume.level : 1) * 100));
      
      //muted
      that.setStateIfChanged(that._states.playerMuted.name,
                             {val: ("volume" in status ? status.volume.muted : false), ack: true},
                             ("volume" in cachedStatus ? cachedStatus.volume.muted : false));

      //Media channel status
      let media       = status.media        ? status.media        : {};
      let cachedMedia = cachedStatus.media  ? cachedStatus.media  : {};
      
      //streamType
      that.setStateIfChanged(that._states.streamType.name,
                             {val: (media.streamType ? media.streamType : "Unknown"), ack: true},
                             (cachedMedia.streamType ? cachedMedia.streamType : "Unknown"));
      
      //duration
      that.setStateIfChanged(that._states.duration.name,
                             {val: (media.duration ? media.duration : "Unknown"), ack: true},
                             (cachedMedia.duration ? cachedMedia.duration : "Unknown"));
      
      //contentType
      that.setStateIfChanged(that._states.contentType.name,
                             {val: (media.contentType ? media.contentType : "Unknown"), ack: true},
                             (cachedMedia.contentType ? media.contentType : "Unknown"));
      
      //contentId
      let contentId       = media.contentId       ? media.contentId : "Unknown";
      let cachedContentId = cachedMedia.contentId ? media.contentId : "Unknown";
      that.setStateIfChanged(that._states.contentId.name,
                             {val: contentId, ack: true},
                             cachedContentId);
      
      //Metadata channel status
      let metadata        = media.metadata        ? media.metadata :        {};        
      let cachedMetadata  = cachedMedia.metadata  ? cachedMedia.metadata :  {};
      
      //title
      that.setStateIfChanged(that._states.title.name,
                                 {val: (metadata.title ? metadata.title :        "Unknown"), ack: true},
                                 (cachedMetadata.title ? cachedMetadata.title :  "Unknown"));
      
      //album
      that.setStateIfChanged(that._states.album.name,
                             {val: (metadata.albumName ? metadata.albumName :        "Unknown"), ack: true},
                             (cachedMetadata.albumName ? cachedMetadata.albumName :  "Unknown"));
      
      //artist
      that.setStateIfChanged(that._states.artist.name,
                             {val: (metadata.artist ? metadata.artist :        "Unknown"), ack: true},
                             (cachedMetadata.artist ? cachedMetadata.artist :  "Unknown"));
    }
    
    
    _playURL(url2play, org_url2play, streamType)
    {
      let that = this;
        
      if (org_url2play === undefined)
          org_url2play = url2play;
      
      //Assume live stream by default
      if (streamType === undefined)
          streamType = 'LIVE';

      if (url2play.indexOf("http") !== 0) {
        //Not an http(s) URL -> assume local file
        adapter.log.info("%s - Not a http(s) URL -> asume local file for %s", that._name, url2play);
        
        //Check that the webserver has been configured
        if (adapter.config.webServer === "") {
          adapter.log.error(that._name + '- Sorry, cannot play file "' + url2play + '"'); 
          adapter.log.error(that._name + '- Please configure webserver settings first!');
          return;
        }
        
        let exported_file_state = adapter.namespace + "." + that._states.exportedMedia.name;
        //Try to load in a local state
        try {
          adapter.setBinaryState(exported_file_state, fs.readFileSync(url2play), function (err) {
            if (err) {
              adapter.log.error(that._name + ' - Cannot store file "' + url2play + '" into ' + exported_file_state + ': ' + err.toString());
              return;
            }
            
            //Calculate the exported URL
            url2play = 'http://' + adapter.config.webServer + ':8082/state/' + exported_file_state;
            adapter.log.info("Exported as " + url2play);
            that._playURL(url2play, org_url2play, 'BUFFERED');
          });
        } catch (err) {
          adapter.log.error(that._name + ' - Cannot play file "' + url2play + '": ' + err.toString());                   
        }
        return;
      }
      
      that._mediaPlayer.playUrlPromise (url2play /*org_url2play, streamType*/)
      .then (function () {
        adapter.setState(that._states.url2play.name, {val: org_url2play,  ack: true});
      })
      .catch (function (err) {
        adapter.log.error(that._name + ' - Cannot play file "' + url2play + '": ' + err.toString());
      });
    }
    
    
    

    // is called if a subscribed state changes
    _ioBrokerChange (id, state)
    {
      let that = this;
      let states = that._states;
      let name = that._name;
      
      if (
        (id.indexOf(that._NAMESPACE) !== 0) || 
        (state == undefined) ||
        (state.from.indexOf(adapter.namespace) >= 0)
      )
        return;
        
    
      // Warning, state can be null if it was deleted
      adapter.log.debug(name + ' - device stateChange ' + id + ' ' + JSON.stringify(state));

      // you can use the ack flag to detect if it is status (true) or command (false)
      if (state.ack)
        return;
        

      //Is volume?
      else if (id.indexOf(adapter.namespace + "." + states.volume.name) === 0) {
        that._mediaPlayer.setVolumePromise(state.val)
        //ACK written when status update sent by Chromecast
        .catch (function (err) {
          adapter.log.error(name + " - " + err);
        });
      }
      //Is muted?
      else if (id.indexOf(adapter.namespace + "." + states.muted.name) === 0) {
        if (state.val)
        {
          //mute
          that._mediaPlayer.mutePromise()
          //ACK written when status update sent by Chromecast
          .catch (function (err) {
            adapter.log.error(name + " - Could not mute: " + err);
          });
        } else {
          //unmute
          that._mediaPlayer.unmutePromise()
          //ACK written when status update sent by Chromecast
          .catch (function (err) {
            adapter.log.error(name + " - Could not unmute: " + err);
          });
        }
      }
      //Is playing?
      else if (id.indexOf(adapter.namespace + "." + states.playing.name) === 0) {
          
        if (state.val) {
            //Try to play last contentID
            adapter.getState(states.contentId.name, function (err, state) {
              if (state && state.val && state.val.startsWith("http")) {
                  that._playURL(state.val);
              } else { 
                //Try to play last url2play
                adapter.getState(states.url2play.name, function (err, state) {
                  if (state && state.val && state.val.startsWith("http")) {
                      that._playURL(state.val);
                  } else {
                      //Could not find a valid link to play -> set to false again
                      adapter.setState(id, false);
                  }
                });
              }
            });
        } else {
          that._mediaPlayer.stopPromise()
          //ACK written when status update sent by Chromecast
          .catch (function (err) {
            adapter.log.error(name + " - Could not stop: " + err);
          });
        }
      }
      //Is paused?
      else if (id.indexOf(adapter.namespace + "." + states.paused.name) === 0) {
        if (state.val) {
          that._mediaPlayer.pausePromise()
          //ACK written when status update sent by Chromecast
          .catch (function (err) {
            adapter.log.error(name + " - Could not pause: " + err);
          });
        } else {
          that._mediaPlayer.playPromise()
          //ACK written when status update sent by Chromecast
          .catch (function (err) {
            adapter.log.error(name + " - Could not resume: " + err);
          });
        }
      }
      //Is jump?
      else if (id.indexOf(adapter.namespace + "." + states.jump.name) === 0) {
        that._mediaPlayer.jumpInPlaylistPromise(state.val)
        .then (function () {
          adapter.setState(id, {val: state.val,  ack: true});
        })
        .catch (function (err) {
          adapter.log.error(name + " - Could not jump: " + err);
        });
      }
      //Is repeatMode?
      else if (id.indexOf(adapter.namespace + "." + states.repeatMode.name) === 0) {
        adapter.log.error(name + ' - Please use the other boolean repeat variables to set repeat mode for ' + id);
      }
      //Is repeatOff?
      else if (id.indexOf(adapter.namespace + "." + states.repeatOff.name) === 0) {
        that._mediaPlayer.setRepeatModePromise(state.val?'REPEAT_OFF':'REPEAT_ALL')
        //ACK written when status update sent by Chromecast
        .catch (function (err) {
          adapter.log.error(name + " - Could not set repeatOff: " + err);
        });
      }
      //Is repeatAllShuffle?
      else if (id.indexOf(adapter.namespace + "." + states.repeatAllShuffle.name) === 0) {
        that._mediaPlayer.setRepeatModePromise(state.val?'REPEAT_ALL_AND_SHUFFLE':'REPEAT_OFF')
        //ACK written when status update sent by Chromecast
        .catch (function (err) {
          adapter.log.error(name + " - Could not repeatAllShuffle: " + err);
        });
      }
      //Is repeatAll?
      else if (id.indexOf(adapter.namespace + "." + states.repeatAll.name) === 0) {
        that._mediaPlayer.setRepeatModePromise(state.val?'REPEAT_ALL':'REPEAT_OFF')
        //ACK written when status update sent by Chromecast
        .catch (function (err) {
          adapter.log.error(name + " - Could not repeatAll: " + err);
        });
      }
      //Is repeatSingle?
      else if (id.indexOf(adapter.namespace + "." + states.repeatSingle.name) === 0) {
        that._mediaPlayer.setRepeatModePromise(state.val?'REPEAT_SINGLE':'REPEAT_OFF')
        //ACK written when status update sent by Chromecast
        .catch (function (err) {
          adapter.log.error(name + " - Could not repeatSingle: " + err);
        });
      }
      //Is announcement?
      else if (id.indexOf(adapter.namespace + "." + states.announcement.name) === 0) {
        that._mediaPlayer.playAnnouncementPromise(state.val)
        .then (function () { 
          adapter.setState(id, {val: state.val,  ack: true});
        })
        .catch (function (err) {
          adapter.log.error(name + " - Could not play announcement: " + err);
        });
      }
      //Is url2play?
      else if (id.indexOf(adapter.namespace + "." + states.url2play.name) === 0) {
        that._playURL(state.val);                    
      } else {
        //Unsupported state change
        adapter.log.error(name + ' - Sorry, update for ' + id + ' not supported!');
      }
      
    } // end of _ioBrokerChange
    
  } // end of ChromecastDevice class

  return ChromecastDevice;
};
