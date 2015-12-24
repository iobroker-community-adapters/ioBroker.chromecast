![Logo](admin/chromecast.png)
iobroker.chromecast
=============
### A Chromecast adapter for ioBorker

*Work in progress*

Based on ioBroker.template

Using [node-castv2-client](https://github.com/thibauts/node-castv2-client) to connect to Chromecast devices

What is working?
----------------

* detect devices with either SSDP or multicast-dns
* create ioBroker objects for each found device
* status, player, media and metadata channels
* control Chromecast device from adapter
  * set volume
  * stop broadcasting
  * pause (not tested yet!)
  * play url (write to device.player.url2play)
    * assume MP3

What is missing?
----------------

* support for Chromecast audio groups
  * currently the adapter ignore devices playing as part of a group
* detect metadata when launching player via device.player.url2play
* publish to npm
* publish to ioBroker
* more testing


## Changelog

#### 0.0.0
* (Vegetto) initial release

## License
The MIT License (MIT)

Copyright (c) 2015 Vegetto<iobroker@angelnu.com>

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
