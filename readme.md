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
