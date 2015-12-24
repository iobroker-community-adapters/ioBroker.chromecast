/* 
 * ChromecastDevice 
 */
var Client                = require('castv2-client').Client;
//var Application           = require('castv2-client').Application;
var DefaultMediaReceiver  = require('castv2-client').DefaultMediaReceiver;

var ChromecastDevice = function (adapter, address, name) {
	
	adapter.log.info(name + " - Found (Address:"+address+")");
	
	var that = this;
	
	var adapter = adapter;
	var address = address;
	var name    = name.replace(/[.\s]+/g, '_');
	
	var player  = undefined;
	var currentApplicationObject = undefined;
	
	//Some constants
	var NAMESPACE = adapter.namespace+"."+name;
	
	//Create ioBroker objects
	var states = createObjects();
	
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
		        		  write:  false,
		        		  role:   'status',
		        		  desc:   'ioBroker adapter connected to Chromecast'
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
		adapter.setState(states.url2play.name,   {val: '', ack: true});
		
		//return States
		return states;		
		
	};
	
	function connectClient(){
		
		//Register for status updates
		client.on('status', updateStatus);
		
		//Register for errors
		client.once('error', function(err) {
			//log and close connection
			adapter.log.error(name + " - Error: "+JSON.stringify(err));
			client.removeListener('status', updateStatus);
			client.close();
			//Set playing and connected status to false
			adapter.setState(states.playing.name, {val: false, ack: true});
			adapter.setState(states.connected.name, {val: false, ack: true});
			//Try to reconnect
			connectClient();
		});
		
		//Connect client
		client.connect(address, function() {
			adapter.log.info(name + " - Connected");
			adapter.setState(states.connected.name, {val: true, ack: true});
			
			//Register for status updates
			client.getStatus(function(err, status){
				updateStatus(status);
			});
			
		});		
		
	}
	
	function updateStatus(status){
		//volume object seems to always be there
		adapter.setState(states.volume.name, {val: (status.volume.level*100), ack: true});
		adapter.setState(states.muted.name, {val: status.volume.muted, ack: true});
		
		//if the Chromecast has an application running then try to attach DefaultMediaReceiver
		//NOTE: this might fail in case the Chromecast is running a weird player
		//      It works fine with the TuneIn and Plex applications
		if ("applications" in status){
			currentApplicationObject = status.applications[0];
			//TBD: I need to find out how to get chromecast audio working...
			if ((currentApplicationObject.appId == "MultizoneFollower") ||
				(currentApplicationObject.appId == "MultizoneLeader"))
				adapter.log.info(name+' currentApplicationObject ' + JSON.stringify(status));
			else
				joinPlayer();			
		} else {
			currentApplicationObject = undefined
			detachPlayer();
		}
	}
	
	function joinPlayer(){
		if (!player) {
			//We do not have a player object yet
			client.join(currentApplicationObject,
						DefaultMediaReceiver,
						function(err, p) {
				if (!err){
					//We attached fine -> remember player object
					player = p;
					//Register for player status updates
					player.on('status', updatePlayerStatus);
					player.getStatus(function(err, pStatus) {
						if (err) 
							adapter.log.error(name+" - "+err);
						else
							updatePlayerStatus(pStatus);
					});
					//set playing state to true
					adapter.setState(states.playing.name, {val: true, ack: true});
				}
			});
		}
	}
	
	function detachPlayer() {
		//Remove player listener if there was one
		if (player) {
			player.removeListener('status', updatePlayerStatus);
			player = undefined;
		}
		adapter.setState(states.playing.name, {val: false, ack: true});
	}
	
	function launchPlayer(callback) {
		if (player){
			
			if (player.APP_ID == currentApplicationObject.appId) {
				return; //Our player is already loaded
			}
			
			player.stop();
			detachPlayer();						
		}
		
		client.launch(DefaultMediaReceiver, function(err, p) {
			if (!err){
				//We attached fine -> remember player object
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
	
	function updatePlayerStatus(pStatus){
		adapter.log.debug(name+' player status ' + JSON.stringify(pStatus));
		
		//Player channel status
		if (!pStatus) pStatus = {};
		adapter.setState(states.playerState.name, {val: pStatus.playerState, ack: true});
		adapter.setState(states.currentTime.name, {val: Math.floor(pStatus.currentTime), ack: true});
		adapter.setState(states.paused.name,      {val: (pStatus.playerState == "PAUSE"), ack: true});
		adapter.setState(states.repeat.name,      {val: (pStatus.repeatMode  == "REPEAT_ON"), ack: true});
		
		//Media channel status
		var media = pStatus.media;
		if (!media) media = {};
		adapter.setState(states.streamType.name,  {val: media.streamType,  ack: true});
		adapter.setState(states.duration.name,    {val: media.duration,    ack: true});
		adapter.setState(states.contentType.name, {val: media.contentType, ack: true});
		adapter.setState(states.contentId.name,   {val: media.contentId,   ack: true});
		
		//Metadata channel status
		var metadata = media.metadata;
		if (!metadata) metadata = {};
		adapter.setState(states.title.name,  {val: metadata.title,  ack: true});
		adapter.setState(states.album.name,  {val: metadata.album,  ack: true});
		adapter.setState(states.artist.name, {val: metadata.artist,  ack: true});
	}
	
	// is called if a subscribed state changes
	function stateChange(id, state) {
		if ((id.indexOf(NAMESPACE) === 0) && 
			state &&
			(state.from.indexOf(adapter.namespace) < 0)
			) {
			// Warning, state can be null if it was deleted
			adapter.log.info(name+' device stateChange ' + id + ' ' + JSON.stringify(state));

			// you can use the ack flag to detect if it is status (true) or command (false)
			if (state && !state.ack) {
				//Is volume?
				if (id.indexOf(adapter.namespace+"."+states.volume.name) === 0){
					client.setVolume({level: (state.val/100)}, function(err,volume){
						if (err) adapter.log.error(name+" - "+err);
						//ACK written when status update sent by Chromecast
					})
				}
				//Is muted?
				if (id.indexOf(adapter.namespace+"."+states.muted.name) === 0){
					client.setVolume({muted: state.val}, function(err,volume){
						if (err) adapter.log.error(name+" - "+err);
						//ACK written when status update sent by Chromecast
					})
				}
				//Is playing?
				if (id.indexOf(adapter.namespace+"."+states.playing.name) === 0){
					if (!state.val) client.stop(player, function(err){
						if (err) adapter.log.error(name+" - "+err);
						//ACK written when status update sent by Chromecast
					});
				}
				//Is playing?
				if (id.indexOf(adapter.namespace+"."+states.url2play.name) === 0){					

					launchPlayer(function(){
						
						var media = {
								// Here you can plug an URL to any mp4, webm, mp3 or jpg file with the proper contentType.
								contentId: state.val,
								"contentType":"audio/mp3",
								streamType: 'BUFFERED', // or LIVE

								// Title and cover displayed while buffering
								metadata: {
									type: 0,
									metadataType: 0,
									title: state.val
								}        
						};

						player.load(media, { autoplay: true }, function(err, status) {
							console.log('media loaded err=%s', err);
						});
					})
				}
			}
		};
	};
};

module.exports = ChromecastDevice;