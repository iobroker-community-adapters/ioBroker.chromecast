/* jshint -W097 */
/* jshint strict: false */
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
const utils = require('@iobroker/adapter-core');
const {LogWrapper} = require("castv2-player"); // Get common adapter utils

let adapter;
function startAdapter(options) {
    options = options || {};
    Object.assign(options, {name: 'chromecast'});

    adapter = new utils.Adapter(options);

    adapter.on('ready', ready);
    adapter.on('unload', unload);

    return adapter;
};

// const SCAN_INTERVAL = 10000;
let scanner = undefined;
let devices = undefined;
function ready () {
    //Own libraries
    const LogWrapper        = require('castv2-player').LogWrapper;
    const Scanner           = require('castv2-player').Scanner(new LogWrapper(adapter.log));

    const ChromecastDevice  = require('./lib/chromecastDevice')(adapter);

    devices = [];

    //Create manually added devices (if any)
    if (adapter.config.manualDevices) {
      for(let i=0;i<adapter.config.manualDevices.length; i++) {
        //Emulate ID
        let device = adapter.config.manualDevices[i];
        device.id = "" + i + "-" + device.name;
        //Emulate registerForUpdates
        device.registerForUpdates = function(){};

        devices.push(new ChromecastDevice(device));
      }
    }

    //var chromecastDevices = {};
    scanner = new Scanner (connection => {
        adapter.log.info(JSON.stringify(connection));
      devices.push(new ChromecastDevice(connection));
    });

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');
}


function unload (callback) {
    try {
      adapter.log.info("Unload triggered");
      scanner.destroy();
      devices.forEach(function (device) {
        device.destroy();
      });
      devices = undefined;
      adapter.log.info("Unload completed sucesfully");
    } catch (error) {
	    console.error(error);
    }
    callback();
}
// If started as allInOne/compact mode => return function to create instance
if (typeof module !== undefined && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
