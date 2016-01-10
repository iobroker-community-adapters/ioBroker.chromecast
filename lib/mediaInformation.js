/*
 * getMediaInfo functions
 * 
 * Allow to retrieve meta data of servers supporting icecast
 * Also find out what type of media is being streamed (audio, video, etc)
 */

var EventEmitter  = require('events').EventEmitter;
var util          = require('util');
var icy           = require('icy');
var devnull       = require('dev-null');
//if (process.env.NODE_ENV !== 'production'){
//    require('longjohn');
//}

const DISCOVER_ICY_METADATA = true;

var Connection = function (url2play, org_url2play, streamType, callback) {
    EventEmitter.call(this);
    this._url2play = url2play;
    this._callback = callback;
    this._media = {
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
    
    //See if we have to run in dummy mode
    if (!DISCOVER_ICY_METADATA) {
        callback(this._media);
        return;
    }
    
    this._pipeOn = false;
    
    try{
        this._requestObject = icy.get(url2play, this._connected.bind(this));
        this._requestObject.on('error', function(e){
            console.log("MediaInformation - ICY connection error for "+this._url2play+": "+e);
        });
    } catch(e){
        console.log("MediaInformation - Cannot connect to "+this._url2play+": "+e);
    }   
}

util.inherits(Connection, EventEmitter);

Connection.prototype.getMedia = function() {
    return this._media;
};

Connection.prototype.close = function() {
    if (this._requestObject){
        this._requestObject.abort();
    }
};


Connection.prototype._connected = function(res){
    console.log("MediaInformation - Connected to "+this._url2play);
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

    if (res.headers &&
        res.headers["content-type"] &&
        ((res.headers["content-type"].indexOf("audio") >=0) ||
         (res.headers["content-type"].indexOf("video") >=0)))
        this._media.contentType = res.headers["content-type"];
    //console.log(this._media);  
    
    if ("icy-name" in res.headers) {
        //As backup call the callback if we do not get
        //first metadata in less than 1 second
        this._timeoutHandler = setTimeout(function(){
            this._callback(this._media);
        },1000);
        
        // log any "metadata" events that happen
        res.on('metadata', this._gotMetadata.bind(this, res));
    } else {
        //Not ICY -> call callback already
        this._callback(this._media);
    }
     
}



Connection.prototype._gotMetadata = function(res, metadata) {
    /*
     * { StreamTitle: 'BILLY IDOL - WHITE WEDDING',
     StreamUrl: '&artist=BILLY%20IDOL&title=WHITE%20WEDDING&album=&duration=&songtype=S&overlay=&buycd=&website=&picture' }
     */
    var parsed = icy.parse(metadata);
    console.log(parsed);

    //Get title
    this._media.metadata.title = parsed.StreamTitle;
    
    //If we got media info then call callback already
    if (this._timeoutHandler){
        clearTimeout(this._timeoutHandler);
        this._timeoutHandler = undefined;
        this._callback(this._media);
    }
    
    //Notify that media has been updated
    this.emit("media", this._media);
    
    if (!this._pipeOn){
        //We need to keep reading in order to receive additional metadata
        //We do it here to avoid reading data for sources that do not send
        //any metadata
        res.pipe(devnull());
        this._pipeOn = true;
    }
};



var activeConnections = {};

function getMediaInfoListerner(callerId, url2play, org_url2play, streamType, callback){
    
    if (url2play in activeConnections &&
        callerId in activeConnections[url2play].callerIDs){
        
        //Call callback
        callback(activeConnections[url2play].connection.getMedia());
        
        //This callerID is already listing the URL
        return activeConnections[url2play].connection;
    }
      
    //Close in case this caller was already listing -> only one connection/callerID
    closeMediaInfoListerner(callerId);
        
    //If this is the first listener for this URL then create object
    if (!(url2play in activeConnections)) {
        var connection = new Connection(url2play, org_url2play, streamType, callback);
        activeConnections[url2play] = {
                callerIDs: {},
                connection: connection
        }
    }   
    
    //Remember callerId
    activeConnections[url2play].callerIDs[callerId] = true;
    
    //Return connection
    return activeConnections[url2play].connection;
}

function closeMediaInfoListerner(callerId){
    for (var url2play in activeConnections){
        
        //Set this callerId as inactive
        activeConnections[url2play].callerIDs[callerId] = false;
        
        //Any active listeners for this URL?
        var anyListenerActive = false;
        for (var i in activeConnections[url2play].callerIDs){
            anyListenerActive |= activeConnections[url2play].callerIDs[i];
        }
        
        if (!anyListenerActive) {
            //None is listening to this URL -> destroy connection
            activeConnections[url2play].connection.close();
            activeConnections[url2play].callerIDs=undefined;
            console.log("Disconnect "+url2play);
            console.log("Last listener was "+callerId);
            delete activeConnections[url2play];
        }
    }  
}

module.exports.getListener   = getMediaInfoListerner;
module.exports.closeListener = closeMediaInfoListerner;
