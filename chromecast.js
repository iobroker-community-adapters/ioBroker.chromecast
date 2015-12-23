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

//Own libraries
var chromecastScanner = require('./lib/chromecastScanner');
var ChromecastDevice  = require('./lib/chromecastDevice');

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



/*
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
}*/

function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info('use useSSDP? ' + adapter.config.useSSDP);
    
    /*
    var resetDevices = true;
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
    					adapter.delObject(device.common.name);
    					adapter.log.info("DONE!");
    					//deleteStates(device.common.name);
    					//deleteChannels(device.common.name);
    					//adapter.deleteDevice(device.common.name);
    				} catch(e) {};
    			}
    		}
    	});
    	adapter.log.info("DONE!");
    	return;
    }*/
    
    chromecastScanner(adapter.config.useSSDP, function (address, name){
    	new ChromecastDevice(adapter, address, name)
    });

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

}


