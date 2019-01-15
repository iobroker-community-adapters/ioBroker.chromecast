/**
 *
 * ioBroker Chromecast adapter
 *
 */

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
const utils = require('@iobroker/adapter-core'); // Get common adapter utils

let adapter;
function startAdapter(options) {
    options = options || {};
    Object.assign(options, {
         name: 'chromecast',
         ready: main
    });
    adapter = new utils.Adapter(options);

    return adapter;
};

// const SCAN_INTERVAL = 10000;
function main() {

    //Own libraries
    const LogWrapper        = require('castv2-player').LogWrapper;
    const Scanner           = require('castv2-player').Scanner(new LogWrapper(adapter.log));

    const ChromecastDevice  = require('./lib/chromecastDevice')(adapter);

    //Create manually added devices (if any)
    if (adapter.config.manualDevices) {
      for(let i=0;i<adapter.config.manualDevices.length; i++) {
        let device = adapter.config.manualDevices[i];
        device.id = "" + i + "-" + device.name;
        new ChromecastDevice(device);
      }
    }

    //var chromecastDevices = {};
    new Scanner (connection => {
      /*chromecastDevices[name] = */new ChromecastDevice(connection);
    });

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');
}

// If started as allInOne/compact mode => return function to create instance
if (typeof module !== undefined && module.parent) {
    module.exports = startAdapter;
} else {
    // or start the instance directly
    startAdapter();
}
