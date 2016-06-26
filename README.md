![Logo](admin/chromecast.png)
ioBroker.chromecast
=============

[![NPM version](http://img.shields.io/npm/v/iobroker.chromecast.svg)](https://www.npmjs.com/package/iobroker.chromecast)
[![Downloads](https://img.shields.io/npm/dm/iobroker.chromecast.svg)](https://www.npmjs.com/package/iobroker.chromecast)

[![NPM](https://nodei.co/npm/iobroker.chromecast.png?downloads=true)](https://nodei.co/npm/iobroker.chromecast/)

### A Chromecast adapter for ioBorker

This plugin allows to detect video and/or Chromecast devices. For each detect Chromecast device an ioBroker device is created. This device displays the status of the device and allows to send it a new URL to cast.

Build on top of the following projects:
  * [ioBroker](http://www.iobroker.net)
  * [node-castv2-client](https://github.com/thibauts/node-castv2-client) as Chromecast client library.

Instructions
------------

1. Install into ioBroker
   1. Go to your ioBroker Adapters tab
   2. Select and install Chromecast adapter
2. Add an instance of the Chromecast adapter
   * it should automatically run after it is installed
3. (optional) If you plan to stream local files you need to configure the adapter
   * you need to have an ioBroker web server instance
4. Check your log: you should see logs about the detected devices
5. Write an URL such as [http://edge.live.mp3.mdn.newmedia.nacamar.net/ps-dieneue_rock/livestream_hi.mp3](http://edge.live.mp3.mdn.newmedia.nacamar.net/ps-dieneue_rock/livestream_hi.mp3) to the chromecast.0.`<your chromecast name>`.player.url2play
6. The URL should start playing on your device

Features
--------

* detect devices with either SSDP or multicast-dns
* create ioBroker objects for each found device
* status, player, media and metadata channels
* control Chromecast device from adapter
  * set volume
  * mute/unmute
  * stop broadcasting
  * pause
  * play url (chromecast.0.`<your chromecast name>`.player.url2play)
    * tested with MP3
      * Full list of formats [here](https://developers.google.com/cast/docs/media).
    * when the url does not start with http then assume that this is a local file
      * export file via ioBroker web server
    * it does not support list files such as .m3u
* Vis widget
  * NOTE: requires [patched vis adapter](https://github.com/angelnu/ioBroker.vis).
* Initial support for Chromecast audio groups
  * Note: this does not work with SSDP -> disable by default in adapter settings
* Play again last played stream: just set _chromecast.0.`<your device>`.status.playing_ to _true_

What is missing?
----------------

* use semaphores to avoid race conditions
* add state machine to track states: detected ->connected -> player loader -> playing
* add retries: sometimes the Chromecast fails to respond to a request
* more testing


Changelog
---------
### 1.0.9
* (Vegetto) Do not use this in callbacks. Replaced with _that_
* (Vegetto) Fix contentId not being updated. This was breaking the _play last stream_ feature

### 1.0.8
* (Vegetto) Do not try to stop if not playing

### 1.0.7
* (Vegetto) Show MultizoneLeader as playing
* (Vegetto) Set pause state to false when modified and device is not playing

### 1.0.6
* (Vegetto) Fix widget crashing when devId is not set

### 1.0.2
* (Vegetto) Fix deprecation warning - use dns-txt instead of mdns-txt

### 1.0.1
* (Vegetto) Fix exception

### 1.0.0
* (Vegetto) **Try to play last played URL when setting playing state to true**
* (Vegetto) Fix jshint and jscs findings

### 0.2.1
* (Vegetto) Update readme
* (Vegetto) Integrated into iobroker: listed there

### 0.2.0
* (Vegetto) Add vis widget (Alpha)
* (Vegetto) Performance improvements

### 0.1.4
* (Vegetto) Stability fixes - error handling, race-condition fixes, etc
* (Vegetto) Clean getMediaInfo handler when disconnecting player
* (Vegetto) Added support to retrieve ICY metadata from https sources
* (Vegetto) Moved code for querying media info to a separate class
* (Vegetto) **Support dynamic IP/port changes (audio groups)**

### 0.1.3
* (Vegetto) Added re-connection with retries. Will try for up 42 hours.
* (Vegetto) Support for triggering a reconnection by writing to <device>.status.connected
* (Vegetto) Fixed race condition when playing local file
* (Vegetto) **Added support for playing local files**
* (Bluefox) Russian translations
* (Vegetto) Update stale metadata when not present in player status
* (Vegetto) **Initial support for audio groups**
* (Vegetto) **Retrieve media type and title from URLs that support ICY**
* (Vegetto) Added displayName, isActiveInput and isStandBy status

### 0.1.2
* (Vegetto) Merge base

### 0.1.1
* (Vegetto) Fix package syntax
* (Vegetto) Fix package dependencies

### 0.1.0
* (Vegetto) Initial release

License
--------
The MIT License (MIT)

Copyright (c) 2015 Vegetto <iobroker@angelnu.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
