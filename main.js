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

const utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

const adapter = new utils.Adapter('chromecast');

adapter.on('ready', main);

// const SCAN_INTERVAL = 10000;
function main() {

    //Own libraries
    const LogWrapper        = require('castv2-player').LogWrapper;
    const Scanner           = require('castv2-player').Scanner(new LogWrapper(adapter.log));

    const ChromecastDevice  = require('./lib/chromecastDevice')(adapter);

    //var chromecastDevices = {};
    new Scanner (connection => {
      /*chromecastDevices[name] = */new ChromecastDevice(connection);
    });

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');
}


