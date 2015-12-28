//SSDP Scanner
var ssdp = require('node-ssdp').Client;
var http = require('http');
function ssdp_scan(callback){
	
	var ssdpBrowser = new ssdp();
	ssdpBrowser.on('response', function (headers, statusCode, rinfo) {
		if (statusCode != 200)
			return;
		if (!headers['LOCATION'])
			return;
		var request = http.get(headers['LOCATION'], function(res) {
			var body = '';
			res.on('data', function(chunk) {
				body += chunk;
			});
			res.on('end', function() {
				if (body.search('<manufacturer>Google Inc.</manufacturer>') == -1)
					return;
				var match = body.match(/<friendlyName>(.+?)<\/friendlyName>/);
				if (!match || match.length != 2)
					return;
				var address = rinfo.address;
				var name = match[1];
				callback(address, name);
			});
		});
	});
	ssdpBrowser.search('urn:dial-multiscreen-org:service:dial:1');
}

//multicast-dns scanner
/*var scanner = require('chromecast-scanner');
function mdsn_scan(callback){
	scanner(function(err, service) {
		callback(service.data, service.name);
	});
}*/

//multicast-dns scanner (find all devices)
var util = require('util');
var mdns = require('multicast-dns');
var find = require('array-find');
var xtend = require('xtend');
var txt = require('mdns-txt')()
function mdsn_scan(callback){
    var m = mdns();
    
    var found_devices = [];

    var onResponse = function(response) {
        
        var txt_field = find(response.additionals, function(entry) {
            return entry.type === 'TXT';
        });

        var srv_field = find(response.additionals, function(entry) {
            return entry.type === 'SRV';
        });

        var a_field = find(response.additionals, function(entry) {
            return entry.type === 'A';
        });

        if (!txt_field || !srv_field || !a_field) {
            return;
        }
        
        //console.log('txt:\n', util.inspect(txt.decode(txt_field.data)));
        
        var ip   = a_field.data;
        var name = txt.decode(txt_field.data).fn;
        var port = srv_field.data.port;
        
        
        if (!ip || !name || !port) {
            return;
        }
        
        if (found_devices.indexOf(name) < 0){
            found_devices.push(name);
            callback(ip, name, port);            
        }
        
        
    }
    m.on('response', onResponse);

    m.query({
      questions:[{
        name: '_googlecast._tcp.local',
        type: 'PTR'
      }]
    });
}

function chromecastScanner(useSSDP, callback) {
    if (useSSDP)
        ssdp_scan(callback);
    else
        mdsn_scan(callback);
}

module.exports = chromecastScanner;