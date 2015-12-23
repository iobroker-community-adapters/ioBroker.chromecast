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
var scanner = require('chromecast-scanner');
function mdsn_scan(callback){
	scanner(function(err, service) {
		callback(service.data, service.name);
	});
}

function chromecastScanner(useSSDP, callback) {
	if (useSSDP)
		ssdp_scan(callback);
	else
		mdsn_scan(callback);
}

module.exports = chromecastScanner;