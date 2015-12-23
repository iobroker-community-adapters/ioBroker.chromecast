/* 
 * ChromecastDevice 
 */
var Client = require('castv2-client').Client;
var ChromecastDevice = function (adapter, address, name) {
	
	adapter.log.info(name + " - Found (Address:"+address+")");
	
	var that = this;
	
	var adapter = adapter;
	var address = address;
	var name    = name;
	
	//Some constants
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
				write: false,
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
				write: false,
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
			adapter.log.error(name + " - Error: %s", err.message);
			client.removeListener('status', onstatus);
			client.close();
			//Set playing and connected status to false
			adapter.setState(OBJECT_STR_PLAYING, {val: false, ack: true});
			adapter.setState(OBJECT_STR_CONNECTED, {val: false, ack: true});
			//Try to reconnect
			connectClient();
		});
		
		//Connect client
		client.connect(address, function() {
			adapter.log.info(name + " - Connected (Address:"+address+")");
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
		if ("applications" in status){
			adapter.setState(OBJECT_STR_PLAYING, {val: true, ack: true});
		} else {
			adapter.setState(OBJECT_STR_PLAYING, {val: false, ack: true});
		}
	}
};

module.exports = ChromecastDevice;