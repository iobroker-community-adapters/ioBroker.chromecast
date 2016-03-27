/**
 *
 * ioBroker Chromecast adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

//For profiling: comment out the following block and connect to
//http://c4milo.github.io/node-webkit-agent/26.0.1410.65/inspector.html?host=localhost:19999&page=0
/*
var agent = require('webkit-devtools-agent');
agent.start({
        port: 19999,
        bind_to: '0.0.0.0',
        ipc_port: 13333,
        verbose: true
    })
*/

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

var SCAN_INTERVAL = 10000;
function main() {

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    adapter.log.info('use useSSDP? ' + adapter.config.useSSDP);
    
    var chromecastDevices = {};
    chromecastScanner(adapter.config.useSSDP,
        function (name, address, port) {
            chromecastDevices[name] = new ChromecastDevice(adapter, name, address, port);
    }, SCAN_INTERVAL,
        function (name, address, port) {
            chromecastDevices[name].updateAddress(address, port);
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


