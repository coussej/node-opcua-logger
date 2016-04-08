var async = require("async");
var opcua = require("node-opcua");

function ReadPump(config, measurements, writepump) {
	var dbname = config.name + ".db";
	var path = require('path').resolve(__dirname, dbname);
	
	this.ua_server_url = config.url;
	this.ua_client  = new opcua.OPCUAClient();
	this.ua_session;
	this.ua_subscription;
	this.measurements = measurements;
	this.polled_nodes = [];
	this.monitored_nodes = [];
}

/**
 * Start the instance's ReadPump.
 */
ReadPump.prototype.start = function() {
	var self = this;
	
	console.log("Initializing OPCUA readpump. Verifying tags.")
	
	async.series({
		connect_opc: function(callback){
			ua_client = new opcua.OPCUAClient();
			uaClient.connect(ua_server, callback);
		},
		establish_session: function(callback){
			setTimeout(function(){
				callback(null, 2);
			}, 100);
		}
	},
	function(err, results) {
		// results is now equal to: {one: 1, two: 2}
	});
}

ReadPump.prototype.ConnectOPCUA = function(callback) {
	this.ua_client.connect(this.ua_server_url, callback);
}

ReadPump.prototype.EstablishSession = function(callback) {
	self = this;
	this.ua_client.createSession(function(err, session){
		if (err) {
			callback(err);
		} else {
			self.ua_session = session;
			callback(null);
		}
	});
}

ReadPump.prototype.InitializeMeasurements = function(callback) {
	self = this;
	var nodesToRead = [];
	self.measurements.forEach(function(m){
		nodesToRead.push({
			nodeId: m.node_id,
			attributeId: opcua.AttributeIds.Value
		});
	});
	
	async.waterfall([
		// execute read request
		function(waterfall_next) {
			self.ua_session.read(nodesToRead, 0, function(err, nodesToRead, dataValues){
				// For some reason, I can't pass waterfall_next as the callback 
				// function to read(). This however works.
				waterfall_next(err, nodesToRead, dataValues);
			});		
		}, 
		// process read response
		function(nodes, dataValues, waterfall_next) {
			dataValues.forEach(
				function(datavalue, i) {
					var sc = datavalue.statusCode
					if (sc.value == 0) {
						console.log("Tag [", self.measurements[i].name , 
									"] verified. Value = [", 
									datavalue.value.value, "].");
						self.monitored_nodes.push({
							name: self.measurements[i].name,
							nodeId: self.measurements[i].node_id,
							updateInterval: self.measurements[i].update_interval
						});
					} else {
						console.log("Tag [", self.measurements[i].name ,
									"] could not be read. Status = [", sc.name, 
									"], Description = [", sc.description, "].");
					}           
				}
			);
		}	
	], 
	// final callback
	function(err, results) {
		callback(err);
	});
	
	self.ua_session.read(nodesToRead, 0, function(err, nodesToRead, dataValues){
		if (err) callback(err);
		
	});
}

module.exports = ReadPump;
