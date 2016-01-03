/*
    ioBroker.chromecast Widget-Set

    version: "0.2.0"

    Copyright 10.2015-2016 Vegetto<iobroker@angelnu.com>

*/
"use strict";

// add translations for edit mode
if (vis.editMode) {
    $.extend(true, systemDictionary, {
        "myColor_tooltip":  {
            "en": "Description of\x0AmyColor",
            "de": "Beschreibung von\x0AmyColor",
            "ru": "Описание\x0AmyColor"
        },
    });
}

// add translations for non-edit mode
$.extend(true, systemDictionary, {
    "Instance":  {"en": "Instance", "de": "Instanz", "ru": "Инстанция"}
});


//Helpers
function getValidDevId(devId){
    if (vis.objects && !(devId in vis.objects)){
        console.log("Error: "+devId+" object not found");
        return undefined;
    }
    
    var devIdParts = devId.split(".");
    if (devIdParts.length < 3) {
        console.log("Error: "+devId+" is not a device/channel/state");
        return undefined;
    }
    
    if (devIdParts[0] != "chromecast") {
        console.log("Error: "+devId+" does not bellong to the chromecast adapter");
        return undefined;
    }
    
    return devIdParts[0]+'.'+devIdParts[1]+'.'+devIdParts[2];
}

function createDeviceWidget4ValidDevId(validDevId, widgetID, view, data, style) {
    var text = '';
    
    text += '<center><input class="value" type="checkbox"/>Connected</center>';
    
    return text;
}

// this code can be placed directly in chromecast.html
vis.binds.chromecast = {
    version: "0.2.0",
    showVersion: function () {
        if (vis.binds.chromecast.version) {
            console.log('Version chromecast: ' + vis.binds.chromecast.version);
            vis.binds.chromecast.version = null;
        }
    },

    createDeviceWidget: function (widgetID, view, data, style) {
        var $div = $('#' + widgetID);
        // if nothing found => wait
        if (!$div.length) {
            return setTimeout(function () {
                vis.binds.chromecast.createDeviceWidget(widgetID, view, data, style);
            }, 100);
        }
        
        var validDevId = getValidDevId(data.devID);
        var name = (validDevId)?validDevId.split(".")[2]:"Not set";
        
        var text = '';
        text += '<center><h1>' + name + '</h1></center>';
        if (validDevId)
            text += createDeviceWidget4ValidDevId(widgetID, view, data, style);
        

        $('#' + widgetID).html(text);
    },
    
    ChromecastDevice: {
        init: function(widgetID, view, data, style){
            var $div = $('#' + widgetID);
            // if nothing found => wait
            if (!$div.length) {
                return setTimeout(function () {
                    vis.binds.chromecast.ChromecastDevice.init(widgetID, view, data, style);
                }, 100);
            }
            
            var validDevId = getValidDevId(data.devoid);
            var name = (validDevId)?validDevId.split(".")[2]:"Not set";
            
            $div.append('<center><h1>' + name + '</h1></center>');
            
            if (validDevId){
                console.log("creating "+validDevId);
                //connected - create
                $div.append('<input class="clientConnected" type="checkbox"/>Connected</br>');
                var $connected = $div.find('input.clientConnected');
                //connected - register for iobroker state updates
                var ioBrokerState = validDevId+".status.connected";
                vis.states.bind(ioBrokerState + '.val', function (e, newVal, oldVal) {
                    console.log("BBBBBBBBBBBBBBBB");
                    $connected.prop('checked', newVal);
                });
                $connected.change(function (evt) {
                    console.log("connected: "+$(this).prop('checked'));
                });
                
              //url2play - create
                $div.append('<input class="url2play" type="text"/>URL2play</br>');
                var $url2play = $div.find('input.url2play');
                //url2play - register for iobroker state updates
                var url2play_state = validDevId+".player.url2play";
                vis.states.bind(url2play_state + '.val', function (e, newVal, oldVal) {
                    console.log("BBBBBBBBBBBBBBBB url2play");
                    $url2play.val(newVal);
                });
                $url2play.val(vis.states[url2play_state + '.val']);
                $url2play.change(function (evt) {
                    console.log("url2play: "+$url2play.val());
                });
            }
        }
    },
    
    changedDevID: function(widgetID, view, newId, attr, isCss){
        var validDevId = getValidDevId(newId);
        if (validDevId && (validDevId != newId)){
            vis.views[view].widgets[widgetID].data[attr] = validDevId;
            return [attr];
        } else {
            return [];
        }
    }

};
	
vis.binds.chromecast.showVersion();