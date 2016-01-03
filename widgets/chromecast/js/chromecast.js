/*
    ioBroker.chromecast Widget-Set

    version: "0.2.0"

    Copyright 10.2015-2016 Vegetto<iobroker@angelnu.com>

*/
"use strict";

// add translations for edit mode
if (vis.editMode) {
    $.extend(true, systemDictionary, {
        "nDevs": {
            "en": "Devices"
        },
        "oid_dev_": {
            "en": "id"
        },
        "group_device": {
            "en": "Generated - Do not change"
        },
        "oid_connected_": {
            "en": "connected id"
        },
        "oid_url2play_": {
            "en": "url2play id"
        }
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

// this code can be placed directly in chromecast.html
vis.binds.chromecast = {
    version: "0.2.0",
    showVersion: function () {
        if (vis.binds.chromecast.version) {
            console.log('Version chromecast: ' + vis.binds.chromecast.version);
            vis.binds.chromecast.version = null;
        }
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
            
            var validDevId = getValidDevId(data.oid_dev_1);
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
                    console.log("Updated "+ioBrokerState);
                    $connected.prop('checked', newVal);
                });
                $connected.prop('checked', vis.states[ioBrokerState + '.val']);
                
                $connected.change(function (evt) {
                    console.log("connected: "+$(this).prop('checked'));
                    vis.setValue(ioBrokerState, $(this).prop('checked'));
                });
                
                //url2play - create
                $div.append('<input class="url2play" type="text"/>URL2play</br>');
                var $url2play = $div.find('input.url2play');
                //url2play - register for iobroker state updates
                var url2play_state = validDevId+".player.url2play";
                vis.states.bind(url2play_state + '.val', function (e, newVal, oldVal) {
                    console.log("Updated "+url2play_state);
                    $url2play.val(newVal);
                });
                $url2play.val(vis.states[url2play_state + '.val']);
                
                $url2play.change(function (evt) {
                    console.log("url2play: "+$url2play.val());
                    vis.setValue(ioBrokerState, $(this).val());
                });
            }
        }
    },
    
    oid_dev_changed: function(widgetID, view, newId, attr, isCss){
        var mods = [];
        //Get device index
        var index = attr.split("_")[2];
        console.log("attr:"+attr+" index:"+index);
        var validDevId = getValidDevId(newId);
        if (validDevId){
            //Set device id
            vis.views[view].widgets[widgetID].data[attr] = validDevId;
            mods.push(attr);
            //Set derived props
            vis.views[view].widgets[widgetID].data["oid_connected_"+index] =
                validDevId+".status.connected";
            mods.push("oid_connected_"+index);
            vis.views[view].widgets[widgetID].data["oid_url2play_"+index] =
                validDevId+".player.url2play";
            mods.push("oid_url2play_"+index);
            
        } else {
            //Reset derived props
            vis.views[view].widgets[widgetID].data["oid_connected_"+index] = "";
            mods.push("oid_connected_"+index);
            vis.views[view].widgets[widgetID].data["oid_url2play_"+index] = "";
            mods.push("oid_url2play_"+index);
        }
        
        return mods;
    }

};
	
vis.binds.chromecast.showVersion();