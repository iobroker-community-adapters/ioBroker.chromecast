/**
 *
 * ioBroker Chromecast adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

// you have to require the utils module and call adapter function
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
var adapter = utils.adapter('chromecast');

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.info('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    // Warning, state can be null if it was deleted
    adapter.log.info('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        adapter.log.info('ack is not set!');
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});


//SSDP Scanner
var ssdp = require('node-ssdp').Client;
var http = require('http');
function ssdp_scan(callback){
	
	var ssdpBrowser = new ssdp();
	ssdpBrowser.on('response', function (headers, statusCode, rinfo) {
		if (statusCode != 200)
			return;
		if (!headers['LOCATION'])
			return;
		var request = http.get(headers['LOCATION'], function(res) {
			var body = '';
			res.on('data', function(chunk) {
				body += chunk;
			});
			res.on('end', function() {
				if (body.search('<manufacturer>Google Inc.</manufacturer>') == -1)
					return;
				var match = body.match(/<friendlyName>(.+?)<\/friendlyName>/);
				if (!match || match.length != 2)
					return;
				var address = rinfo.address;
				var name = match[1];
				callback(address, name);
			});
		});
	});
	ssdpBrowser.search('urn:dial-multiscreen-org:service:dial:1');
}

//multicast-dns scanner
var scanner = require('chromecast-scanner');
function mdsn_scan(callback){
	scanner(function(err, service) {
		callback(service.data, service.name);
	});
}

var player = require('chromecast-player')();
function found_device(address, name) {

	adapter.log.info("Found Chromecast - Address:"+address+" NAME:"+name);
	adapter.setObject(name, {
        type: 'device',
        common: {
        	name: name
        },
        native: {}
    });
	
	adapter.setObject(name+'.address', {
        type: 'state',
        common: {
        	name: name+'.address',
            type: 'boolean',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });
	adapter.setState(name+'.address', {val: address, ack: true});
	
	adapter.setObject(name+'.active', {
        type: 'state',
        common: {
        	name: name+'.active',
            type: 'boolean',
            role: 'indicator',
            write: false,
            read: true
        },
        native: {}
    });

	player.attach({address:address},function(err, p) {
		if (err === null){
			adapter.setState(name+'.active', {val: true, ack: true});
			console.log("Attached to active "+name);
			adapter.setObject(name+".media", {
		        type: 'channel',
		        common: {
		        	name: name+".media"
		        },
		        native: {}
		    });
			
			adapter.setObject(name+".media.metadata", {
		        type: 'channel',
		        common: {
		        	name: name+".media.metadata"
		        },
		        native: {}
		    });
			
			p.getStatus(function(err,s){statusChanged(s)});
			p.on('status', statusChanged);
		} else{
			//console.log(err);
			adapter.setState(name+'.active', {val: false, ack: true});
		}
	});
	
	function statusChanged(s){
		try {
			Object.keys(s.media.metadata).forEach(function (k) {
				var v = s.media.metadata[k];
				
				adapter.setObject(name+'.media.metadata.'+k, {
					type: 'state',
					common: {
						name: name+'.media.metadata.'+k,
						type: 'string',
		                write: false,
		                read: true
					},
					native: {}
				});
				adapter.setState(name+'.media.metadata.'+k, {val: v, ack: true});
			});
		} catch(e) {
			adapter.setState(name+'.active', {val: false, ack: true});
		}
	}
}


function debugObject(obj){
	adapter.log.info(Object.getOwnPropertyNames(obj));
}

function deleteStates(device, channel){
	adapter.getStatesOf(device, channel, function (err, states) {
		adapter.log.info("Deleting states for device "+device+" and channel "+channel);
    	if (err || !states) {
            return;
        }
    	adapter.log.info("err "+JSON.stringify(err));
    	adapter.log.info("states "+JSON.stringify(states));
    	
    	for (var i in states) {
    		adapter.log.info("VAMOS "+i);
    		var state = states[i];

    		adapter.log.info("Deleting state "+state.common.name);
    		adapter.deleteState(device,channel,state.common.name);
    		adapter.log.info("BORRADO "+state);

    	}
    });
}

function deleteChannels(device){
	adapter.getChannels(device+'.*', function (err, channels) {
    	if (err || !channels) {
            return;
        }
        for (var i in channels) {
        	if (channels.hasOwnProperty(i)) {
            	var channel = channels[i];
            	try{
            		adapter.log.info("Deleting channel "+channel.common.name);
            		deleteStates(device,channel.common.name);
            		//adapter.deleteChannel(channel.common.name);
            	} catch(e) {};
            }
        }
    });
}

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info('use useSSDP? ' + adapter.config.useSSDP);
    
    var resetDevices = false;
    if (resetDevices) {
    	adapter.getDevices('*', function (err, devices) {
    		if (err || !devices) {
    			return;
    		}
    		for (var i in devices) {
    			if (devices.hasOwnProperty(i)) {
    				var device = devices[i];
    				try{
    					adapter.log.info("Deleting device "+device.common.name);
    					deleteStates(device.common.name);
    					deleteChannels(device.common.name);
    					adapter.deleteDevice(device.common.name);
    				} catch(e) {};
    			}
    		}
    	});
    	adapter.log.info("DONE!");
    	return;
    }
    if (adapter.config.useSSDP)
    	ssdp_scan(found_device);
    else
    	mdsn_scan(found_device);

    /**
     *
     *      For every state in the system there has to be also an object of type state
     *
     *      Here a simple template for a boolean variable named "testVariable"
     *
     *      Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
     *
     */

    

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');
    


    /**
     *   setState examples
     *
     *   you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
     *
     */
/*
    // the variable testVariable is set to true as command (ack=false)
    adapter.setState('testVariable', true);

    // same thing, but the value is flagged "ack"
    // ack should be always set to true if the value is received from or acknowledged from the target system
    adapter.setState('testVariable', {val: true, ack: true});

    // same thing, but the state is deleted after 30s (getState will return null afterwards)
    adapter.setState('testVariable', {val: true, ack: true, expire: 30});



    // examples for the checkPassword/checkGroup functions
    adapter.checkPassword('admin', 'iobroker', function (res) {
        console.log('check user admin pw ioboker: ' + res);
    });

    adapter.checkGroup('admin', 'admin', function (res) {
        console.log('check group user admin group admin: ' + res);
    });

*/

}
