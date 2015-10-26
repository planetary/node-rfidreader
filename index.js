'use strict';
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var serialPort = require("serialport");
var request = require("request");
var async = require("async");
serialPort.list(function (err, ports) { console.log(ports); });
/**
 * Overwrites obj1's values with obj2's and adds obj2's if non existent in obj1
 * @param obj1
 * @param obj2
 * @returns obj3 a new object based on obj1 and obj2
 */
function merge_options(obj1,obj2){
    var obj3 = {};
    for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
    for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }
    return obj3;
}

// --------------------------------------------------
var RFIDReader = function(options) {
	EventEmitter.call(this);

	var self = this;
	var defaults = {comName: "cu.usbmodem", baudrate: 9600}
	var settings = merge_options(defaults, options);
	var port = null;
	var allowed = ["serialNumber", "comName", "manufacturer"];
	var key = null;
	var reader_ready = false;
	var options =  {  
		baudrate: settings.baudrate,
		parser: serialPort.parsers.readline("\n") 
	};

	allowed.forEach(function(_key){
		if(settings.hasOwnProperty(_key)) 
			key = _key;
	});

	if(key==null)
		throw "You must provide one of the following: "+allowed.join(", ");
	


	// ----------------------------------------------
	//	FUNCTIONS
	// ----------------------------------------------

	var stay_connected = function(next) {
		//console.log("stay_connected");
		if(port==null || !port.isOpen()) {
			console.warn("port closed. attemping to open")
			return open_port(next);
		}
			
		setTimeout(next, 500);
	}

	// var ready_check = function(){ 
	// 	if(!reader_ready) {
	// 		console.warn("reader not ready. closing and trying again.")
	// 		self.close(); 
	// 	}
	// }

	var open_port = function(callback) {
		var re =  new RegExp(settings[key]);
		serialPort.list(function (err, ports) {
			ports = ports || [];
			var info = null;
			ports.forEach(function(_info){
				if(_info[key].match(re)) {
					info = _info;
				}
			});
			
			if(info==null) 
				return setTimeout(callback, 1000);

			port = new serialPort.SerialPort(info.comName, options);
			port.on("open", function (error) {
				if(!error) {
					console.log("open!");
					port.on('data', on_data);
					port.on('close', on_close);
					port.on('error', on_error);

					// reader_ready=false;
					// setTimeout(ready_check, 10000);
				}
				callback();
			});
		});
	}

	var on_data = function(data) {
		console.log('data: ' + data);
		data = data.trim();

		if(data.charAt(0)=="#") {
			 if(data=="# READY") reader_ready = true
			 return; // We don't care about comments.
		}

		var match = /^([a-zA-Z0-9]{8}),([0-4])$/.exec(data);
		if(match) {
			var tokenID = match[1];
			var tokenType = match[2];
			var options = {
				url: 'http://master.local:5000/user',
				qs: {tokenID: tokenID},
				timeout: 1000
			};
			request(options, function (error, response, body) {
				if(error) {
					self.emit("error", "Can't reach master");
					return console.error(error);
				}
				if(response.statusCode != 200) {
					self.emit("error", body)
					return console.error(response.statusCode, body);
				}

				try {
					var json = JSON.parse(body);
					if(json.error) {
						self.emit("error", json.error);
					} else {
						self.emit("user", json);
					}
				} catch(e) {
					self.emit("error", "bad JSON response from master");
					return console.error(e);
				}
			});
		} else {
			console.warn("unrecognized input from reader")
		}
	}

	var on_close = function() {
		console.log("on_close");
		self.close();
		port = null;
	}

	var on_error = function(err) {
		console.log("on_error", err)
	}

	this.close = function() {
		if(port) {
			console.log("closing reader");
			port.close(function(err){
				if(err) console.error(err);
				else console.log("closed")
			});
		}
	}

	async.forever(stay_connected);
}


util.inherits(RFIDReader, EventEmitter);
module.exports = RFIDReader;



