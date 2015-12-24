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
	
	//Some constants
	var NAMESPACE            = adapter.namespace+"."+name;
	var OBJECT_STR_ADDRESS   = name+'.address';
	var OBJECT_STR_STATUS    = name+'.status';
	var OBJECT_STR_CONNECTED = OBJECT_STR_STATUS+'.connected';
	var OBJECT_STR_PLAYING   = OBJECT_STR_STATUS+'.playing';
	var OBJECT_STR_VOLUME    = OBJECT_STR_STATUS+'.volume';
	var OBJECT_STR_MUTED     = OBJECT_STR_STATUS+'.muted';
	
	//Create ioBroker objects
	createObjects();
	
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

		//Create state for address
		adapter.setObject(OBJECT_STR_ADDRESS, {
			type: 'state',
			common: {
				name: OBJECT_STR_ADDRESS,
				type: 'boolean',
				role: 'indicator',
				write: false,
				read: true
			},
			native: {}
		});
		adapter.setState(OBJECT_STR_ADDRESS, {val: address, ack: true});

		//Create channel for status
		adapter.setObject(OBJECT_STR_STATUS, {
			type: 'channel',
			common: {
				name: OBJECT_STR_STATUS,
			},
			native: {}
		});
		
		//Create state for connected
		adapter.setObject(OBJECT_STR_CONNECTED, {
			type: 'state',
			common: {
				name: OBJECT_STR_CONNECTED,
				type: 'boolean',
				role: 'status',
				write: false,
				read: true
			},
			native: {}
		});
		adapter.setState(OBJECT_STR_CONNECTED, {val: false, ack: true});

		//Create state for playing
		adapter.setObject(OBJECT_STR_PLAYING, {
			type: 'state',
			common: {
				name: OBJECT_STR_PLAYING,
				type: 'boolean',
				role: 'status',
				write: true,
				read: true
			},
			native: {}
		});
		adapter.setState(OBJECT_STR_PLAYING, {val: false, ack: true});
		
		//Create state for volume
		adapter.setObject(OBJECT_STR_VOLUME, {
			type: 'state',
			common: {
				name: OBJECT_STR_VOLUME,
				type: 'number',
				role: 'status',
				write: true,
				read: true
			},
			native: {}
		});
		
		//Create state for muted
		adapter.setObject(OBJECT_STR_MUTED, {
			type: 'state',
			common: {
				name: OBJECT_STR_MUTED,
				type: 'boolean',
				role: 'status',
				write: true,
				read: true
			},
			native: {}
		});
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
			adapter.setState(OBJECT_STR_PLAYING, {val: false, ack: true});
			adapter.setState(OBJECT_STR_CONNECTED, {val: false, ack: true});
			//Try to reconnect
			connectClient();
		});
		
		//Connect client
		client.connect(address, function() {
			adapter.log.info(name + " - Connected");
			adapter.setState(OBJECT_STR_CONNECTED, {val: true, ack: true});
			
			//Register for status updates
			client.getStatus(function(err, status){
				updateStatus(status);
			});
			
		});		
		
	}
	
	function updateStatus(status){
		adapter.setState(OBJECT_STR_VOLUME, {val: status.volume.level, ack: true});
		adapter.setState(OBJECT_STR_MUTED, {val: status.volume.muted, ack: true});
		if (!player && "applications" in status){
			client.join(status.applications[0],
					DefaultMediaReceiver,
					function(err, p) {
				if (!err){
					player = p;
					player.on('status', updatePlayerStatus);
					adapter.setState(OBJECT_STR_PLAYING, {val: true, ack: true});
					player.getStatus(function(err, pStatus) {
						if (err) adapter.log.error(name+" - "+err);
						updatePlayerStatus(pStatus);
					});
				}
			})		
		} else {
			adapter.setState(OBJECT_STR_PLAYING, {val: false, ack: true});
			player = undefined;
		}
	}
	
	function updatePlayerStatus(pStatus){
		adapter.log.info(name+' player status ' + JSON.stringify(pStatus));
	}
	
	// is called if a subscribed state changes
	function stateChange(id, state) {
		if ((id.indexOf(NAMESPACE) === 0) && 
			state &&
			(state.from.indexOf(adapter.namespace) < 0)
			) {
			// Warning, state can be null if it was deleted
			adapter.log.info(name+' stateChange ' + id + ' ' + JSON.stringify(state));

			// you can use the ack flag to detect if it is status (true) or command (false)
			if (state && !state.ack) {
				adapter.log.info(adapter.namespace+"."+OBJECT_STR_VOLUME);
				//Is volume?
				if (id.indexOf(adapter.namespace+"."+OBJECT_STR_VOLUME) === 0){
					client.setVolume({level: state.val}, function(err,volume){
						if (err) adapter.log.error(name+" - "+err);
						//ACK written when status update sent by Chromecast
					})
				}
				//Is muted?
				if (id.indexOf(adapter.namespace+"."+OBJECT_STR_MUTED) === 0){
					client.setVolume({muted: state.val}, function(err,volume){
						if (err) adapter.log.error(name+" - "+err);
						//ACK written when status update sent by Chromecast
					})
				}
				//Is playing?
				if (id.indexOf(adapter.namespace+"."+OBJECT_STR_PLAYING) === 0){
					if (!state.val) client.stop(player, function(err){
						if (err) adapter.log.error(name+" - "+err);
						//ACK written when status update sent by Chromecast
					});
				}
			}
		};
	};
};

module.exports = ChromecastDevice;