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
					m = self.measurements[i];
					// If the value could not be read, log. Otherwise, silently
					// continue adding the measurement.
					if (sc.value !== 0) {
						console.log("Measurment [", m.name, " - ", m.node_id ,
									"] could not be read. Status = [", sc.name, 
									"], Description = [", sc.description, "].");
					}
					self.AddMeasurement(m);
				}
			);
			waterfall_next(null);
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

ReadPump.prototype.AddMeasurement = function (m) {
	if (m.hasOwnProperty("collection_type")) {
		switch (m.collection_type) {
			case "monitored":
				if (m.hasOwnProperty("monitor_resolution")) {
					this.monitored_nodes.push({
						name: m.name,
						node_id: m.node_id,
						monitor_resolution: m.monitor_resolution,
						deadband_absolute: m.deadband_absolute || 0,
						deadband_relative: m.deadband_relative || 0
					});	
				} else {
					console.log("Measurement was specified as monitored but has no monitor_resolution", m);
				}
				break;
			case "polled":
				if (m.hasOwnProperty("poll_rate") 
					&& m.poll_rate >= 1 
					&& m.poll_rate <= 60) {					
					var update_interval = math.Round(60 / m.poll_rate);
					while (60 % update_interval !== 0) {
						updateinterval += 1;
					}
					this.polled_nodes.push({
						name: m.name,
						node_id: m.node_id,
						update_interval: update_interval,
						deadband_absolute: m.deadband_absolute || 0,
						deadband_relative: m.deadband_relative || 0
					});	
				} else {
					console.log("Measurement was specified as polled but has no or invalid poll_rate", m);
				}
				break;
			default:
				console.log("Invalid collection type for measurement", m);
		}

	} else {
		console.log("Property collection_type not found for measurement", m);
	}
}

module.exports = ReadPump;
