"use strict"

var async = require("async");
var opcua = require("node-opcua");

function ReadPump(config, measurements, writepump) {
	this.uaServerUrl = config.url;
	this.uaClient  = new opcua.OPCUAClient();
	this.uaSession;
	this.uaSubscription;
	this.measurements = measurements;
	this.polledNodes = [];
	this.monitoredNodes = [];
	this.writepump = writepump;
}

ReadPump.prototype.ConnectOPCUA = function (callback) {
	this.uaClient.connect(this.uaServerUrl, callback);
}

ReadPump.prototype.EstablishSession = function (callback) {
	let self = this;
	this.uaClient.createSession(function(err, session){
		if (err) {
			callback(err);
		} else {
			self.uaSession = session;
			callback(null);
		}
	});
}

ReadPump.prototype.ExecuteOPCUAReadRequest = function (nodes, useSourceTimestamp, callback) {
	let self = this;
	let d = new Date;
	let n = Math.round(d.getTime() / 1000) * 1000; // date in ms rounded to the second.
	
	self.uaSession.read(nodes, 0, function (err, nodesToRead, dataValues) {
		if (err) {
			callback(err, []);
			return;
		}
		let results = []
		dataValues.forEach(
			function(dv, i) {		
				let res = dataValueToPoint(nodesToRead[i], dv)
				if (!useSourceTimestamp) {
					res.values.time = n;
				}
				results.push(res);
			}
		);
		callback(null, results);
	});
}	
	
ReadPump.prototype.StartMonitoring = function (callback) {
	let self = this;
	
	// create an OPCUA subscription	
	self.uaSubscription = new opcua.ClientSubscription(self.uaSession, {
		requestedPublishingInterval: 1000,
		requestedLifetimeCount: 10,
		requestedMaxKeepAliveCount: 2,
		maxNotificationsPerPublish: 20,
		publishingEnabled: true,
		priority: 1
	});	
	let sub = self.uaSubscription;
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
	self.monitoredNodes.forEach(
		function (node) {
			let uaMonitoredItem = 
				sub.monitor(
					node,
					{	
					clienthandle: 13,
					samplingInterval: node.monitor_resolution,
					discardOldest: true,
					queueSize: 1000
				},
				opcua.read_service.TimestampsToReturn.Both,
			 	function(err){
					if (err) callback(err);
				});
			uaMonitoredItem.on("changed", function(dataValue) {
				console.log(dataValueToPoint(node, dataValue));
			});

			uaMonitoredItem.on("err", function (err_message) {
				console.log(uaMonitoredItem.itemToMonitor.nodeId.toString(), 
							" ERROR :", err_message);
			});

			// add the monitored item to the node in the list.
			node.uaMonitoredItem = uaMonitoredItem;
		}
	);
}

ReadPump.prototype.StartPolling = function (callback) {
	let self = this;
	
	// install a schedule that triggers every second.
	let schedule = require('node-schedule');
	let rule = new schedule.RecurrenceRule();
	rule.second = new schedule.Range(0, 59, 1);

	let job = schedule.scheduleJob(rule, function(){
		let d = new Date();
		let s = d.getSeconds();
		console.log('Triggered at:', new Date());
		
		let nodesToRead = self.polledNodes.filter(function (node) {
			return s % node.pollInterval === 0
		});
		
		if (nodesToRead.length > 0) {
			self.ExecuteOPCUAReadRequest(nodesToRead, false, function(err, results){
				// For some reason, I can't pass waterfall_next as the callback 
				// function. This however works.
				console.log(results);
			});		
		}
	});
}

ReadPump.prototype.InitializeMeasurements = function () {
	let self = this;
	self.measurements.forEach(function(m) {
		if (m.hasOwnProperty("collectionType")) {
			switch (m.collectionType) {
				case "monitored":
					if (m.hasOwnProperty("monitorResolution")) {
						self.monitoredNodes.push({
							name: m.name,
							nodeId: m.nodeId,
							attributeId: opcua.AttributeIds.Value,
							tags: m.tags,
							monitorResolution: m.monitorResolution,
							deadbandAbsolute: m.deadbandAbsolute || 0,
							deadbandRelative: m.deadbandRelative || 0
						});	
					} else {
						console.log("Measurement was specified as monitored but has no monitor_resolution", m);
					}
					break;
				case "polled":
					if (m.hasOwnProperty("pollRate") 
						&& m.pollRate >= 1 
						&& m.pollRate <= 60) {					
						var pollInterval = Math.round(60 / m.pollRate);
						while (60 % pollInterval !== 0) {
							pollInterval += 1;
						}
						self.polledNodes.push({
							name: m.name,
							nodeId: m.nodeId,
							attributeId: opcua.AttributeIds.Value,
							tags: m.tags,
							pollInterval: pollInterval,
							deadbandAbsolute: m.deadbandAbsolute || 0,
							deadbandRelative: m.deadbandRelative || 0
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
	});
}

ReadPump.prototype.VerifyMeasurements = function(callback) {
	let self = this;
	
	async.waterfall([
		// execute read request
		function(waterfall_next) {
			self.ExecuteOPCUAReadRequest(self.measurements, true, function(err, results){
				// For some reason, I can't pass waterfall_next as the callback 
				// function. This however works.
				console.log(results);
				waterfall_next(err, results);
			});		
		}, 
		// process read response
		function(results, waterfall_next) {
			results.forEach(
				function(res, i) {
					let sc = res.tags.opcstatus
					let m = res.measurement
					// If the value could not be read, log. Otherwise, silently
					// continue adding the measurement.
					if (sc !== 0) {
						console.log("Measurement [", m, " - ", m ,
									"] could not be read. Status = [", sc, 
									"]");
					}
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

ReadPump.prototype.AddDataValueToWritePump = function(values) {
	console.log(values);
	//if ((typeof values.value === "number" || 
	//	 typeof values.value === "boolean") && 
	//	!isNaN(values.value)) {
	//	//self.writepump.AddPointToBuffer({
	//	console.log({
	//		measurement: node.name, 
	//		values: values, 
	//		tags:tags
	//	});
	//} else {
	//	console.log(node.name, ": Type [", typeof values.value, 
	//				"] of value [", values.value,
	//				"] not allowed.")
	//}				
}

ReadPump.prototype.Run = function() {
	var self = this;
	
	// Start both the monitoring and the polling of the measurments. 
	// In case of an error, close everything.
	async.parallel({
		monitoring: function(parallel_callback){
			// install the subscription
			self.StartMonitoring(parallel_callback);
		},
		polling: function(parallel_callback){
			// start polling
			self.StartPolling(parallel_callback);
		}
	},
	function(err, results) {
		// results is now equals to: {one: 1, two: 2}
	});
}

function dataValueToPoint (node, dataValue) {
	let tags = node.tags;
	tags.opcstatus = dataValue.statusCode.value;
	return {
		measurement: node.name,
		values: {
			value: dataValue.value.value,
			time: dataValue.sourceTimestamp.getTime()
		}, 
		tags: tags
	};
}


module.exports = ReadPump;
