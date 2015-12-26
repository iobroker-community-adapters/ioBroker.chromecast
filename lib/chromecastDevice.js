/* 
 * ChromecastDevice class
 */

var Client                = require('castv2-client').Client;
var DefaultMediaReceiver  = require('castv2-client').DefaultMediaReceiver;

const STATUS_QUERY_TIME = 3000; //mseconds

var ChromecastDevice = function (adapter, address, name) {
	
	adapter.log.info(name + " - Found (Address:"+address+")");
	
	var that = this;
	
	var adapter = adapter;
	var address = address;
	var name    = name.replace(/[.\s]+/g, '_');
	
	//Internal variables
	var player  = undefined;
	var currentApplicationObject = undefined;
	var launching = false;
	
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
		adapter.setState(states.volume.name, {val: Math.round(status.volume.level*100), ack: true});
		adapter.setState(states.muted.name, {val: status.volume.muted, ack: true});
		
		//if the Chromecast has an application running then try to attach DefaultMediaReceiver
		//NOTE: this might fail in case the Chromecast is running a weird player
		//      It works fine with the TuneIn and Plex applications
		if ("applications" in status){
			currentApplicationObject = status.applications[0];
			//TBD: I need to find out how to get chromecast audio working...
			if (//(currentApplicationObject.appId == "MultizoneFollower") ||
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
		if (!player && !launching) {
			//We do not have a player object yet
			client.join(currentApplicationObject,
						DefaultMediaReceiver,
						function(err, p) {
				if (!err){
					adapter.log.info(name + " - Attached player");
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
				}else
					adapter.log.error(name+' failed to attach player: '+err);
			});
		}
	}
	
	function detachPlayer() {
		//Remove player listener if there was one
		if (player) {
			player.removeListener('status', updatePlayerStatus);
			//reset status of player states
			updatePlayerStatus({});
			player = undefined;
			adapter.log.info(name + " - Detached player");
		}
		adapter.setState(states.playing.name, {val: false, ack: true});
	}
	
	function launchPlayer(callback) {
		adapter.log.debug(name + " - launchPlayer "+player);
		if (player){
			adapter.log.info(name + " - own player was already loaded");
			if (player.APP_ID == currentApplicationObject.appId) {
				callback();
				return; //Our player is already loaded
			}
			
			player.stop();
			detachPlayer();						
		}
		
		launching = true;
		client.launch(DefaultMediaReceiver, function(err, p) {
			if (!err){
				adapter.log.info(name + " - launched player");
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
			} else
				adapter.log.info(name+' failed to launch player: '+err);
			launching = false;
		});
	}
	
	var getStatusTimeout = undefined;
	function updatePlayerStatus(pStatus){
		adapter.log.debug(name+' player status ' + JSON.stringify(pStatus));
		
		//Player channel status
		var status = pStatus;
		if (!status) status = {};
		setStateIfChanged(states.playerState.name, {val: status.playerState, ack: true});
		setStateIfChanged(states.currentTime.name, {val: Math.floor(status.currentTime), ack: true});
		setStateIfChanged(states.paused.name,      {val: (status.playerState == "PAUSE"), ack: true});
		setStateIfChanged(states.repeat.name,      {val: (status.repeatMode  == "REPEAT_ON"), ack: true});
		
		//Media channel status
		var media = status.media;
		if (!media) media = {};
		setStateIfChanged(states.streamType.name,  {val: media.streamType,  ack: true});
		setStateIfChanged(states.duration.name,    {val: media.duration,    ack: true});
		setStateIfChanged(states.contentType.name, {val: media.contentType, ack: true});
		setStateIfChanged(states.contentId.name,   {val: media.contentId,   ack: true});
		
		//Metadata channel status
		var metadata = media.metadata;
		if (!metadata) metadata = {};
		setStateIfChanged(states.title.name,  {val: metadata.title,  ack: true});
		setStateIfChanged(states.album.name,  {val: metadata.album,  ack: true});
		setStateIfChanged(states.artist.name, {val: metadata.artist,  ack: true});
		
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
				if ((val == undefined) ||
					(val == state.val) ||
					((val.val == state.val) && (val.ack == state.ack))){
					adapter.setState(id, val);
				} else 
					adapter.log.debug(name+' - '+id+' value unchanged -> SKIP');
			}
				
		});
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
				else if (id.indexOf(adapter.namespace+"."+states.muted.name) === 0){
					client.setVolume({muted: state.val}, function(err,volume){
						if (err) adapter.log.error(name+" - "+err);
						//ACK written when status update sent by Chromecast
					})
				}
				//Is playing?
				else if (id.indexOf(adapter.namespace+"."+states.playing.name) === 0){
					if (!state.val) client.stop(player, function(err){
						if (err) adapter.log.error(name+" - "+err);
						//ACK written when status update sent by Chromecast
					});
				}
				//Is paused?
				else if (id.indexOf(adapter.namespace+"."+states.paused.name) === 0){
					if (player) {
						if (state.val)
							player.pause(function(){});
						else
							player.play(function(){});
					}
					//ACK written when status update sent by Chromecast
				}
				//Is url2play?
				else if (id.indexOf(adapter.namespace+"."+states.url2play.name) === 0){					
					
					launchPlayer(function(){
						
						var media = {
								// Here you can plug an URL to any mp4, webm, mp3 or jpg file with the proper contentType.
								contentId: state.val,
								contentType: 'audio/mp3',
								streamType: 'LIVE', // or BUFFERED

								// Title and cover displayed while buffering
								metadata: {
									type: 0,
									metadataType: 0,
									title: state.val
								}        
						};

						player.load(media, { autoplay: true }, function(err, status) {
							if (err){
								adapter.log.error(name+' - media loaded err=%s', err);
								detachPlayer();
							}else {
								adapter.log.info(name + " - Playing "+state.val);
								//ACK after we successfully started playing
								adapter.setState(states.url2play.name, {val: state.val,  ack: true});
							}
						});
					})
				}
				else
					adapter.log.error(name+' - Sorry, update for '+id+' not supported!');
			}
		};
	};
};



module.exports = ChromecastDevice;