![Logo](admin/chromecast.png)
iobroker.chromecast
=============
### A Chromecast adapter for ioBorker

This plugin allows to detect video and/or Chromecast devices. For each detect Chromecast device an ioBroker device is created. This device displays the status of the device and allows to send it a new URL to cast.

Build on top of the following projects:
  * [ioBroker](http://www.iobroker.net)
  * [node-castv2-client](https://github.com/thibauts/node-castv2-client) as Chromecast client library.

Instructions
------------

1. Install into ioBroker
   1. Go to your ioBroker Adapters tab
   2. Click on *Install from custom URL*
   3. Enter [https://github.com/angelnu/ioBroker.chromecast](https://github.com/angelnu/ioBroker.chromecast)
2. Add an instance of the Chromecast adapter
   * it should automatically run after it is installed
3. Check your log: you should see logs about the detected devices
4. Write an URL such as [http://edge.live.mp3.mdn.newmedia.nacamar.net/ps-dieneue_rock/livestream_hi.mp3](http://edge.live.mp3.mdn.newmedia.nacamar.net/ps-dieneue_rock/livestream_hi.mp3) to the chromecast.0.`<your chromecast name>`.player.url2play
5. The URL should start playing on your device

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
    * it does not support list files such as .m3u

What is missing?
----------------

* support for Chromecast audio groups
  * currently the adapter ignore devices playing as part of a group
* detect metadata when launching player via device.player.url2play
* support for sayit adapter
* publish to npm
* publish to ioBroker
* more testing


Changelog
---------

### 0.1.3
* (Vegetto) Added re-connects with retries

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
