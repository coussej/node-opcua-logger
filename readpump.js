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
	this.writepump = writepump;
}

ReadPump.prototype.ConnectOPCUA = function (callback) {
	this.ua_client.connect(this.ua_server_url, callback);
}

ReadPump.prototype.EstablishSession = function (callback) {
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

ReadPump.prototype.InstallSubscription = function (callback) {
	self = this;
	
	// create an OPCUA subscription	
	self.ua_subscription = new opcua.ClientSubscription(self.ua_session, {
		requestedPublishingInterval: 1000,
		requestedLifetimeCount: 10,
		requestedMaxKeepAliveCount: 2,
		maxNotificationsPerPublish: 20,
		publishingEnabled: true,
		priority: 1
	});	
	sub = self.ua_subscription;
	sub.on("started", function() {
		console.log("subscription", sub.subscriptionId, "started");
	}).on("keepalive", function() {
		console.log("subscription", sub.subscriptionId, "keepalive");
	}).on("terminated", function() {
		var err = "subscription" + sub.subscriptionId + "was terminated" ;
		callback(err);
	});
	
	// install a monitored item on the subscription for each measurement in 
	// the readpump's monitored items.
	self.monitored_nodes.forEach(
		function(node){
			var ua_monitored_item = 
				sub.monitor({
					nodeId: opcua.resolveNodeId(node.node_id),
					attributeId: opcua.AttributeIds.Value
				},{	
					clienthandle: 13,
					samplingInterval: node.monitor_resolution,
					discardOldest: true,
					queueSize: 1000
				},
				opcua.read_service.TimestampsToReturn.Both,
			 	function(err){
					if (err) callback(err);
				});
			ua_monitored_item.on("changed", function(dataValue) {
				var values = {
					"value": dataValue.value.value,
					"opcstatus": dataValue.statusCode.value,
					"time": dataValue.sourceTimestamp.getTime()
				};
				var tags = node.tags;
				if ((typeof values.value === "number" || 
					 typeof values.value === "boolean") && 
					!isNaN(values.value)) {
					//self.writepump.AddPointToBuffer({
					console.log({
						measurement: node.name, 
						values: values, 
						tags:tags
					});
				} else {
					console.log(node.name, ": Type [", typeof values.value, 
								"] of value [", values.value,
								"] not allowed.")
				}				
			});

			ua_monitored_item.on("err", function (err_message) {
				console.log(ua_monitored_item.itemToMonitor.nodeId.toString(), 
							" ERROR :", err_message);
			});

			// add the monitored item to the node in the list.
			node.ua_monitored_item = ua_monitored_item;
		}
	);
	
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
	function(err) {
		callback(err);
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
						tags: m.tags,
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
						tags: m.tags,
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

ReadPump.prototype.Run = function() {
	var self = this;
	
	// Start both the monitoring and the polling of the measurments. 
	// In case of an error, close everything.
	async.parallel({
		monitoring: function(parallel_callback){
			// install the subscription
			self.InstallSubscription(parallel_callback);
		},
		polling: function(parallel_callback){
		}
	},
	function(err, results) {
		// results is now equals to: {one: 1, two: 2}
	});
}


module.exports = ReadPump;
