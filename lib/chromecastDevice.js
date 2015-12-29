/* 
 * ChromecastDevice class
 */

var Client                = require('castv2-client').Client;
var DefaultMediaReceiver  = require('castv2-client').DefaultMediaReceiver;
var fs                    = require('fs');
var icy                   = require('icy');
var devnull               = require('dev-null');

const STATUS_QUERY_TIME = 3000; //mseconds

//NOTE: the retries are implemented in this way:
// the first retry will be tried after 1*DELAY_CONNECTION_RETY ms
// the second retriy will be tried after 2*DELAY_CONNECTION_RETY
//
// Therefore it will give up after
// MAX_CONECTIONS_RETRIES * (MAX_CONECTIONS_RETRIES +1) * DELAY_CONNECTION_RETY /2
// 100 * 101 * 30000 /2 = 42 hours
const DELAY_CONNECTION_RETY = 1000; // 30 seconds
const MAX_CONECTIONS_RETRIES = 100;

var ChromecastDevice = function (adapter, address, name, port) {

    adapter.log.info(name + " - Found (Address:"+address+" Port:"+port+")");

    var that = this;

    var adapter = adapter;
    var address = address;
    var name    = name.replace(/[.\s]+/g, '_');
    var port    = port;

    //Internal variables
    var player  = undefined;
    var currentApplicationObject = undefined;
    
    //Internal status
    var connectedClient = false;
    var connectingPlayer = false;
    var connectedPlayer = false;
    
    //Information retrieved via ICY
    var titleViaIcy = false;

    //Some constants
    var NAMESPACE = adapter.namespace+"."+name;

    //Create ioBroker objects
    var states = createObjects();

    //reset status of player states
    updatePlayerStatus({});

    //Create client
    var client = new Client();

    //Connect client
    connectClient();

    adapter.on('stateChange', stateChange);

    //end of constructor

    function createObjects() {

        //Create a device object
        adapter.setObject(name, {
            type: 'device',
            common: {
                name: name
            },
            native: {}
        });

        var CHANNEL_STATUS    = name+'.status';
        var channels = {
                'status': {
                    name:   name+'.status',
                    desc:   'Status channel for Chromecast device'
                },
                'player': {
                    name:   name+'.player',
                    desc:   'Player channel for Chromecast device'
                },
                'media': {
                    name:   name+'.media',
                    desc:   'Media channel for Chromecast device'
                },
                'metadata': {
                    name:   name+'.metadata',
                    desc:   'Metadata channel for Chromecast device'
                },
                'exportedMedia': {
                    name:   name+'.exportedMedia',
                    desc:   'Media exported via ioBroker web server'
                }
        };

        //Create/update all channel definitions
        for (var k in channels) {
            adapter.setObject(channels[k].name, {
                type: 'channel',
                common: channels[k],
                native: {}
            });
        };

        var states = {
                //Top level
                'address': {
                    name:   name+'.address',
                    def:    address,
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'address',
                    desc:   'Address of the Chromecast'
                },
                //Status channel
                'connected': {
                    name:   channels.status.name+'.connected',
                    def:    false,
                    type:   'boolean',
                    read:   true,
                    write:  true,
                    role:   'status',
                    desc:   'ioBroker adapter connected to Chromecast. Writing to this state will trigger a disconnect followed by a connect (that might fail).'
                },
                'playing': {
                    name:   channels.status.name+'.playing',
                    def:    false,
                    type:   'boolean',
                    read:   true,
                    write:  true,
                    role:   'status',
                    desc:   'Player loaded. Setting to false stops play.'
                },
                'volume': {
                    name:   channels.status.name+'.volume',
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
                    name:   channels.status.name+'.muted',
                    def:    false,
                    type:   'boolean',
                    read:   true,
                    write:  true,
                    role:   'status',
                    desc:   'is muted?'
                },
                'isActiveInput': {
                    name:   channels.status.name+'.isActiveInput',
                    def:    true,
                    type:   'boolean',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   '(HDMI only) TV is set to use Chromecast as input'
                },
                'isStandBy': {
                    name:   channels.status.name+'.isStandBy',
                    def:    false,
                    type:   'boolean',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   '(HDMI only) TV is standby'
                },
                'displayName': {
                    name:   channels.status.name+'.displayName',
                    def:    "",
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'Chromecast player display name'
                },
                'statusText': {
                    name:   channels.status.name+'.text',
                    def:    "",
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'Chromecast player status as text'
                },
                //Player channel
                'url2play': {
                    name:   channels.player.name+'.url2play',
                    def:    '',
                    type:   'string',
                    read:   true,
                    write:  true,
                    role:   'command',
                    desc:   'URL that the chomecast should play from'
                },
                'playerState': {
                    name:   channels.player.name+'.playerState',
                    def:    '',
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'Player status'
                },
                'paused': {
                    name:   channels.player.name+'.paused',
                    def:    false,
                    type:   'boolean',
                    read:   true,
                    write:  true,
                    role:   'status',
                    desc:   'is paused?'
                },
                'currentTime': {
                    name:   channels.player.name+'.currentTime',
                    def:    0,
                    type:   'number',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'Playing time?',
                    unit:   's'	  
                },
                'repeat': {
                    name:   channels.player.name+'.repeatMode',
                    def:    false,
                    type:   'boolean',
                    read:   true,
                    write:  true,
                    role:   'status',
                    desc:   'repeat playing media?'
                },
                'playerVolume': {
                    name:   channels.player.name+'.volume',
                    def:    1,
                    type:   'number',
                    read:   true,
                    write:  true,
                    role:   'status',
                    desc:   'volume in %',
                    min:    0,
                    max:    100,
                    desc:   'Player volume'
                },
                'playerMuted': {
                    name:   channels.player.name+'.muted',
                    def:    false,
                    type:   'boolean',
                    read:   true,
                    write:  true,
                    role:   'status',
                    desc:   'Player is muted?'
                },
                //Media channel
                'streamType': {
                    name:   channels.media.name+'.streamType',
                    def:    '',
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'Type of stream being played - LIVE or BUFFERED'
                },
                'duration': {
                    name:   channels.media.name+'.duration',
                    def:    -1,
                    type:   'number',
                    read:   true,
                    write:  false,
                    role:   'status',
                    unit:   's',
                    desc:   'Duration of media being played'
                },
                'contentType': {
                    name:   channels.media.name+'.contentType',
                    def:    '',
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'Type of media being played such as audio/mp3'
                },
                'contentId': {
                    name:   channels.media.name+'.contentId',
                    def:    '',
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'id of content being played. Usally the URL.'
                },
                //Metadata channel
                'title': {
                    name:   channels.metadata.name+'.title',
                    def:    '',
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'Title'
                },
                'album': {
                    name:   channels.metadata.name+'.album',
                    def:    '',
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'Album'
                },
                'artist': {
                    name:   channels.metadata.name+'.artist',
                    def:    '',
                    type:   'string',
                    read:   true,
                    write:  false,
                    role:   'status',
                    desc:   'Artist'
                },
                //Exported media
                'exportedMedia': {
                    name:   channels.exportedMedia.name+'.mp3',
                    type:   'object',
                    read:   true,
                    write:  false,
                    role:   'web',
                    desc:   'Can be accessed from web server under http://ip:8082/state/chromecast.0.<device name>.exportedMedia.mp3'
                }
        };

        //Create/update all state definitions
        for (var k in states) {
            adapter.setObject(states[k].name, {
                type: 'state',
                common: states[k],
                native: {}
            });
        };

        //Set some objects
        adapter.setState(states.address.name,   {val: address, ack: true});
        adapter.setState(states.connected.name, {val: false, ack: true});
        adapter.setState(states.playing.name,   {val: false, ack: true});
        
        //Set url2play only if not set already
        adapter.getState(states.url2play.name,function(err,state){
            if (!state){
                adapter.setState(states.url2play.name,   {val: "http:/example.org/playme.mp3", ack: true});
            }
        });

        //return States
        return states;		

    };
    
    
    
    /*
     * Client methods
     */
    
    var connectionRetries = 0;
    function reconnectClient(){
        
        if (client){
            if (player) {
                try{
                    detachPlayer();
                } catch (e){
                    adapter.log.error(name + " - error detaching player: "+e);
                }
            }
            try{
                client.removeListener('status', updateStatus);
                if (connectedClient) client.close();
            } catch (e){
                adapter.log.error(name + " - error closing client: "+e);
            }
            client = undefined;
            connectedClient = false;
        }

        //Set playing and connected status to false
        adapter.setState(states.playing.name, {val: false, ack: true});
        adapter.setState(states.connected.name, {val: false, ack: true});
        
        //Try to re-connect - with a threshold
        connectionRetries++;
        if (connectionRetries>MAX_CONECTIONS_RETRIES){
            adapter.log.warn(name + " - Max amount of reconnects reached - stay offline");
        } else {
            //Try to reconnect after 5 seconds
            setTimeout(function() {

                client = new Client();
                connectClient();
            }, connectionRetries * DELAY_CONNECTION_RETY);      
        };
    };
    function connectClient(){
        
        //Register for status updates
        client.on('status', updateStatus);
        
        //Register for errors
        client.once('close', function(err) {
            adapter.log.error(name + " - Client closed: "+JSON.stringify(err));            
            //Try to re-connect
            reconnectClient();
        });

        //Register for errors
        client.once('error', function(err) {
            adapter.log.warn(name + " - Client error: "+JSON.stringify(err));            
            //Try to re-connect
            reconnectClient();
        });

        //Connect client
        client.connect({host:address, port:port}, function() {
            adapter.log.info(name + " - Connected");
            connectionRetries = 0;
            connectedClient = true;
            adapter.setState(states.connected.name, {val: true, ack: true});

            //Register for status updates
            client.getStatus(function(err, status){
                updateStatus(status);
            });

        });		

    }

    function updateStatus(status){
        /* 
         * Example for Chromecast audio (plex)
         * {"applications":[{"appId":"9AC194DC",
         *                   "displayName":"Plex",
         *                   "namespaces":[{"name":"urn:x-cast:com.google.cast.media"},
         *                                 {"name":"urn:x-cast:plex"}],
         *                   "sessionId":"EB5AB303-F876-48E7-BF4A-5653A00031EA",
         *                   "statusText":"Plex",
         *                   "transportId":"web-283"}],
         *  "volume":{"level":0.007843137718737125,
         *            "muted":false}}
         * 
         * 
         * Example for video
         * {"applications":[{"appId":"E8C28D3C",
         *                   "displayName":"Backdrop",
         *                   "namespaces":[{"name":"urn:x-cast:com.google.cast.sse"}],
         *                   "sessionId":"89967E57-7F4E-4449-A5F0-62A2F4C7AB73",
         *                   "statusText":"","transportId":"web-58"}],
         *  "isActiveInput":false,
         *  "isStandBy":false,
         *  "volume":{"level":1,
         *            "muted":false}}
         * 
         */
        
        adapter.log.debug(name+' currentApplicationObject ' + JSON.stringify(status));
        
        //volume object seems to always be there
        adapter.setState(states.volume.name, {val: Math.round(status.volume.level*100), ack: true});
        adapter.setState(states.muted.name, {val: status.volume.muted, ack: true});
        
        //Video Chromecast-only
        adapter.setState(states.isActiveInput.name, {val: ("isActiveInput" in status? status.isActiveInput: true ), ack: true});
        adapter.setState(states.isStandBy.name,     {val: ("isStandBy"     in status? status.isStandBy    : false), ack: true});

        //if the Chromecast has an application running then try to attach DefaultMediaReceiver
        //NOTE: this might fail in case the Chromecast is running a weird player
        //      It works fine with the TuneIn and Plex applications
        if ("applications" in status){
            currentApplicationObject = status.applications[0];
            
            //display name and status
            adapter.setState(states.displayName.name, {val: ("displayName" in currentApplicationObject? currentApplicationObject.displayName: "" ), ack: true});
            adapter.setState(states.statusText.name,  {val: ("statusText"  in currentApplicationObject? currentApplicationObject.statusText:  "" ), ack: true});
            
            
            if (//(currentApplicationObject.appId == "MultizoneFollower") ||
                (currentApplicationObject.appId == "MultizoneLeader")) {
                //adapter.log.info(name+' currentApplicationObject ' + JSON.stringify(status));
            } else
                if (!connectedPlayer && !connectingPlayer) joinPlayer();			
        } else {
            currentApplicationObject = undefined
            detachPlayer();
        }
    }
    
    
    
    /*
     * Player methods
     */

    function joinPlayer(){
        if (!connectedClient){
            adapter.log.error(name + " - Cannot join player: client not connected!");
        } else if (connectedPlayer){
            adapter.log.error(name + " - Cannot join player: player already connected!");
        } else if (connectingPlayer) {
            adapter.log.error(name + " - Cannot join player: player already connecting!");
        } else {
            //We do not have a player object yet
            connectingPlayer = true;
            client.join(currentApplicationObject,
                    DefaultMediaReceiver,
                    function(err, p) {
                connectingPlayer = false;
                if (err){
                    adapter.log.error(name+' failed to attach player: '+err);
                } else {
                    adapter.log.info(name + " - Attached player");
                    //We attached fine -> remember player object
                    player = p;
                    
                    //set playing state to true
                    adapter.setState(states.playing.name, {val: true, ack: true});
                    connectedPlayer = true;
                    
                    //Register for player status updates
                    player.on('status', updatePlayerStatus);
                    player.getStatus(function(err, pStatus) {
                        if (err) 
                            adapter.log.error(name+" - "+err);
                        else
                            updatePlayerStatus(pStatus);
                    });                   
                }                    
            });
        }
    }

    function detachPlayer() {
        //Remove player listener if there was one
        if (player) {
            connectedPlayer = false;
            connectingPlayer = false;
            
            //Stop getting media info
            stop_getMediaInfo();
            
            //Unregister player status updates
            player.removeListener('status', updatePlayerStatus);
            
            //reset status of player states
            updatePlayerStatus({});
            
            player = undefined;
            currentApplicationObject = undefined;
            
            adapter.log.info(name + " - Detached player");
        }
        adapter.setState(states.playing.name, {val: false, ack: true});
    }

    function launchPlayer(callback) {
        if (connectedClient)
            adapter.log.debug(name + " - Launching player");
        else{
            adapter.log.error(name + " - Cannot launchPlayer: no connection to client");
            return;
        }
        if (connectingPlayer || connectedPlayer){
            adapter.log.info(name + " - own player was already loaded");
            if (player.APP_ID == currentApplicationObject.appId) {
                callback();
                return; //Our player is already loaded
            }

            detachPlayer();						
        }

        connectingPlayer = true;
        client.launch(DefaultMediaReceiver, function(err, p) {
            if (err) {
                adapter.log.info(name+' failed to launch player: '+err);
            } else {
                adapter.log.info(name + " - Launched player");
                connectedPlayer = true;
                //We launched fine -> remember player object
                player = p;
                //Register for player status updates
                player.on('status', updatePlayerStatus);
                player.getStatus(function(err, pStatus) {
                    if (err) adapter.log.error(name+" - "+err);
                    updatePlayerStatus(pStatus);
                });
                //set playing state to true
                adapter.setState(states.playing.name, {val: true, ack: true});
                callback();
            }
        });
    }

    var getStatusTimeout = undefined;
    function updatePlayerStatus(pStatus){
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
        adapter.log.debug(name+' - Player status: ' + JSON.stringify(pStatus));

        //Player channel status
        var status = pStatus;
        if (!status) status = {};
        setStateIfChanged(states.playerState.name, {val: (status.playerState ?status.playerState :"STOP"), ack: true});
        setStateIfChanged(states.currentTime.name, {val: Math.floor(status.currentTime), ack: true});
        setStateIfChanged(states.paused.name,      {val: (status.playerState == "PAUSE"), ack: true});
        setStateIfChanged(states.repeat.name,      {val: (status.repeatMode  == "REPEAT_ON"), ack: true});
        setStateIfChanged(states.playerVolume.name,{val: Math.round(("volume" in status ? status.volume.level   : 1)*100),    ack: true});
        setStateIfChanged(states.playerMuted.name, {val: ("volume" in status ? status.volume.muted   : false),    ack: true});

        //Media channel status
        var media = status.media;
        if (!media) media = {};
        setStateIfChanged(states.streamType.name,  {val: (media.streamType ?media.streamType :"Unknown"),  ack: true});
        setStateIfChanged(states.duration.name,    {val: (media.duration   ?media.duration   :"Unknown"),    ack: true});
        setStateIfChanged(states.contentType.name, {val: (media.contentType?media.contentType:"Unknown"), ack: true});
        var contentId = media.contentId ? media.contentId : "Unknown"
        setStateIfChanged(states.contentId.name,   {val: contentId,   ack: true});
        
        //If contentId starts with http tries to get media info
        if (contentId.indexOf("http") == 0)
            getMediaInfo(contentId, contentId, "LIVE", function(){});
        
        //Metadata channel status
        var metadata = media.metadata;
        if (!metadata) metadata = {};
        if (!titleViaIcy)
            setStateIfChanged(states.title.name, {val: (metadata.title     ?metadata.title     :"Unknown"),  ack: true});
        setStateIfChanged(states.album.name,     {val: (metadata.albumName ?metadata.albumName :"Unknown"),  ack: true});
        setStateIfChanged(states.artist.name,    {val: (metadata.artist    ?metadata.artist    :"Unknown"),  ack: true});

        //Query status if not queried in the last STATUS_QUERY_TIME mseconds
        if (getStatusTimeout) clearTimeout(getStatusTimeout);
        getStatusTimeout = setTimeout(function(){ 
            if (player) player.getStatus(function(err, pStatus) {
                if (err) 
                    adapter.log.error(name+" - "+err);
                else
                    updatePlayerStatus(pStatus);
            });
        }, STATUS_QUERY_TIME);
    }

    function setStateIfChanged(id, val){
        adapter.getState(id,function(err,state){
            if (err)
                adapter.log.error(name+' - Could not get '+id+':'+err);
            else{
                if (!state)
                    adapter.setState(id, val);
                else if (val != state.val)
                    adapter.setState(id, val);
                else if ((val.val != state.val) ||
                         (val.ack != state.ack)){
                    adapter.setState(id, val);
                } else 
                    adapter.log.debug(name+' - '+id+' value unchanged -> SKIP');
            }

        });
    }
    
    /*
     * getMediaInfo functions
     * 
     * Allow to retrieve meta data of servers supporting icecast
     * Also find out what type of media is being streamed (audio, video, etc)
     */
    
    var _getMediaInfo_requestObject = undefined;
    var _getMediaInfo_arguments;
    var _getMediaInfo_cachedMediaInfo;    
    function stop_getMediaInfo(){
        if (_getMediaInfo_requestObject)
            _getMediaInfo_requestObject.abort();
        _getMediaInfo_requestObject = undefined;
        _getMediaInfo_arguments = false;
        _getMediaInfo_cachedMediaInfo = false;
    }
    
    function getMediaInfo(url2play, org_url2play, streamType, callback){
        
        var arguments = url2play+org_url2play+streamType;
        if (arguments == _getMediaInfo_arguments){
            //console.log(name+" - Do not need to connect");
            callback(_getMediaInfo_cachedMediaInfo);
            return;
        } else {
            //console.log(name+" - Need to connect: clean up old connection");
            stop_getMediaInfo();
        }
        _getMediaInfo_arguments = arguments;
        
        
        _getMediaInfo_requestObject = icy.get(url2play, function(res){
            console.log(name+" - Connected to "+url2play);
            _getMediaInfo_connectedICYRes = res;
            /* 
             * Example from http://edge.live.mp3.mdn.newmedia.nacamar.net/ps-dieneue_rock/livestream_hi.mp3
             * 
             * {'accept-ranges': 'none',
             *  'content-type': 'audio/mpeg',
             *  'icy-br': '128',
             *  'ice-audio-info': 'ice-samplerate=44100;ice-bitrate=128;ice-channels=2',
             *  'icy-description': 'BESTER ROCK UND POP',
             *  'icy-genre': 'Rock',
             *  'icy-name': 'DIE NEUE 107.7',
             *  'icy-pub': '1',
             *  'icy-url': 'http://www.dieneue1077.de',
             *  server: 'Icecast 2.3.3-kh11',
             *  'cache-control': 'no-cache, no-store',
             *  pragma: 'no-cache',
             *  'access-control-allow-origin': '*',
             *  'access-control-allow-headers': 'Origin, Accept, X-Requested-With, Content-Type',
             *  'access-control-allow-methods': 'GET, OPTIONS, HEAD',
             *  connection: 'close',
             *  expires: 'Mon, 26 Jul 1997 05:00:00 GMT',
             *  'icy-metaint': '16000' }
             */
            // log the HTTP response headers
            console.log(res.headers);

            //Information retrieved via ICY
            titleViaIcy = false;

            var media = {
                    // Here you can plug an URL to any mp4, webm, mp3 or jpg file with the proper contentType.
                    contentId: url2play,
                    streamType: streamType, // LIVE or BUFFERED

                    // Title and cover displayed while buffering
                    metadata: {
                        type: 0,
                        metadataType: 0,
                        title: org_url2play
                    }        
            };
            if (res.headers &&
                res.headers["content-type"] &&
                ((res.headers["content-type"].indexOf("audio") >=0) ||
                 (res.headers["content-type"].indexOf("video") >=0)))
                media.contentType = res.headers["content-type"];

            // log any "metadata" events that happen
            res.on('metadata', function (metadata) {
                /*
                 * { StreamTitle: 'BILLY IDOL - WHITE WEDDING',
                 StreamUrl: '&artist=BILLY%20IDOL&title=WHITE%20WEDDING&album=&duration=&songtype=S&overlay=&buycd=&website=&picture' }
                 */
                var parsed = icy.parse(metadata);
                console.log(parsed);

                //TBD: I would like to send the new metadata to the Chromecast
                //but I do not know how without a new load which then interrupts
                //the play...
                media.metadata.title = parsed.StreamTitle;
                titleViaIcy = true;
                setStateIfChanged(states.title.name,  {val: parsed.StreamTitle,  ack: true});

                _getMediaInfo_cachedMediaInfo = media;
                
                //If we did not load yet, load now
                if (delayedLoadMedia) {
                    clearTimeout(delayedLoadMedia);
                    delayedLoadMedia=undefined;
                    callback(media);

                    //We need to keep reading in order to receive additional metadata
                    //We do it here to avoid reading data for sources that do not send
                    //any metadata
                    res.pipe(devnull());
                }                                 
            }); 
            
            _getMediaInfo_cachedMediaInfo = media;

            //Wait one 100ms before calling the callback -> this gives time to load the metadata
            var delayedLoadMedia = setTimeout(function(){
                callback(media);
            }, 100);
        });
    }
    
    function playURL(url2play, org_url2play, streamType){
        if (connectedClient) {
            if (org_url2play === undefined)
                org_url2play = url2play;
            
            //Assume live stream by default
            if (streamType === undefined)
                streamType = 'LIVE';
   
            if (url2play.indexOf("http") != 0) {
                //Not an http(s) URL -> assume local file
                adapter.log.info("Not a http(s) URL -> asume local file");
                
                //Check that the webserver has been configured
                if (adapter.config.webServer == ""){
                    adapter.log.error(name + '- Sorry, cannot play file "' + url2play+'"'); 
                    adapter.log.error(name + '- Please configure webserver settings first!');
                    return;
                }
                
                var exported_file_state = adapter.namespace+"."+states.exportedMedia.name;
                //Try to load in a local state
                try {
                    adapter.setBinaryState(exported_file_state, fs.readFileSync(url2play),function(err){
                      if (err){
                          adapter.log.error(name+' - Cannot store file "' + url2play+' into '+exported_file_state+'": ' + e.toString());
                          return
                      }
                      
                      //Calculate the exported URL
                        url2play = 'http://'+adapter.config.webServer+':8082/state/'+exported_file_state;
                        adapter.log.info("Exported as "+url2play);
                        playURL(url2play, org_url2play, 'BUFFERED');
                    });
                } catch (e) {
                    adapter.log.error(name+' - Cannot play file "' + url2play+'": ' + e.toString());                    
                }
                return;
            }
            
            //get media info
            getMediaInfo(url2play, org_url2play, streamType, function(mediaInfo){
                //launch player
                launchPlayer(function(){
                    //load media
                    loadMedia(mediaInfo);
                });   
            });
            
        } else
            adapter.log.error(name+' - cannot play URL: disconnected from Chromecast');
        
        
        
        function loadMedia(media){
            player.load(media, { autoplay: true }, function(err, status) {
                if (err){
                    adapter.log.error(name+' - media loaded err=%s', err);
                    detachPlayer();
                }else {
                    adapter.log.info(name + " - Playing "+org_url2play);
                    //ACK after we successfully started playing
                    adapter.setState(states.url2play.name, {val: org_url2play,  ack: true});
                }
            });
        }
    }

    // is called if a subscribed state changes
    function stateChange(id, state) {
        if ((id.indexOf(NAMESPACE) === 0) && 
                state &&
                (state.from.indexOf(adapter.namespace) < 0)
        ) {
            // Warning, state can be null if it was deleted
            adapter.log.debug(name+' - device stateChange ' + id + ' ' + JSON.stringify(state));

            // you can use the ack flag to detect if it is status (true) or command (false)
            if (state && !state.ack) {

                //Is connected?
                if (id.indexOf(adapter.namespace+"."+states.connected.name) === 0){
                    adapter.log.warn(name+' - reconnecting as requested by '+state.from);
                    reconnectClient();
                }
                //Is volume?
                else if (id.indexOf(adapter.namespace+"."+states.volume.name) === 0){
                    if (connectedClient) {
                        client.setVolume({level: (state.val/100)}, function(err,volume){
                            if (err) adapter.log.error(name+" - "+err);
                            //ACK written when status update sent by Chromecast
                        });
                    } else
                        adapter.log.error(name+' - cannot set volume: disconnected from Chromecast'); 
                }
                //Is muted?
                else if (id.indexOf(adapter.namespace+"."+states.muted.name) === 0){
                    if (connectedClient) {
                        client.setVolume({muted: state.val}, function(err,volume){

                            if (err) adapter.log.error(name+" - "+err);
                            //ACK written when status update sent by Chromecast
                        });
                    } else
                        adapter.log.error(name+' - cannot (un)mute: disconnected from Chromecast'); 
                }
                //Is playing?
                else if (id.indexOf(adapter.namespace+"."+states.playing.name) === 0){
                    if (connectedClient) {
                        if (!state.val) client.stop(player, function(err){

                            if (err) adapter.log.error(name+" - "+err);
                            //ACK written when status update sent by Chromecast
                        });
                    } else
                        adapter.log.error(name+' - cannot stop: disconnected from Chromecast'); 
                }
                //Is paused?
                else if (id.indexOf(adapter.namespace+"."+states.paused.name) === 0){
                    if (connectedPlayer) {
                        if (state.val)
                            player.pause(function(){});
                        else
                            player.play(function(){});
                        //ACK written when status update sent by Chromecast
                    }else
                        adapter.log.error(name+' - cannot pause: Chromecast not playing'); 

                }
                //Is url2play?
                else if (id.indexOf(adapter.namespace+"."+states.url2play.name) === 0){
                    playURL(state.val);                    
                }
                else
                    adapter.log.error(name+' - Sorry, update for '+id+' not supported!');
            };
        };
    };
};



module.exports = ChromecastDevice;