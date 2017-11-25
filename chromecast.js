/**
 *
 * ioBroker Chromecast adapter
 *
 */

/* jshint -W097 */// jshint strict:false
/*jslint node: true */
/*jshint esversion: 6 */
'use strict';

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
const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

// you have to call the adapter function and pass a options object
// name has to be set and has to be equal to adapters folder name and main file name excluding extension
// adapter will be restarted automatically every time as the configuration changed, e.g system.adapter.template.0
const adapter = new utils.Adapter('chromecast');

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
    if (typeof obj === 'object' && obj.message) {
        if (obj.command === 'send') {
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

// const SCAN_INTERVAL = 10000;
function main() {

    //Own libraries
    const LogWrapper        = require('castv2-player').LogWrapper;
    const Scanner           = require('castv2-player').Scanner(new LogWrapper(adapter.log));

    const ChromecastDevice  = require('./lib/chromecastDevice')(adapter);

    // The adapters config (in the instance object everything under the attribute "native") is accessible via
    // adapter.config:
    
    //var chromecastDevices = {};
    new Scanner (function (connection) {
      /*chromecastDevices[name] = */new ChromecastDevice(connection);
    });

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');

}


