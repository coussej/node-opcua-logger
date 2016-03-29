var async = require("async");
var influx = require("influx");
var opcua = require("node-opcua");
var toml = require("toml");
var writepump = require("./writepump.js");

var config = loadConfig();
console.log(config);

// Get a writepump for the output and start it.
var wp = new writepump(config.output);
wp.Start();

// Declare OPC globals.
var uaClient;         // the opc ua client.
var uaSession;        // the session establiched after connecting the client.
var uaSubscription;   // the subscription installed for the session.
var uaMonitoredNodes = []; // the nodes that are mmonitored in the subscription.

// Execute the OPC logic
async.waterfall([
	// Connect to OPC UA server.
	function(waterfall_next) {
		uaClient = new opcua.OPCUAClient();
		uaClient.connect(config.input.url, waterfall_next);
	},
	// Connection succeeded. Establish a session.
	function(waterfall_next){
		uaClient.createSession(waterfall_next);
	}, 
	// Session established, assign to global.
	function(session, waterfall_next){
		uaSession = session;
		waterfall_next(null);
	}, 
	// Execute a readRequest with all variables to verify the configuration.
	function(waterfall_next){
		var nodesToRead = [];
		config.tags.forEach(function(tag){
			nodesToRead.push({
				nodeId: tag.node_id,
				attributeId: opcua.AttributeIds.Value
			});
		});
		uaSession.read(nodesToRead, 0, function(err, nodesToRead, dataValues){
			// For some reason, I can't pass waterfall_next as the callback 
			// function to read(). This however works.
			waterfall_next(err, nodesToRead, dataValues);
		});
	}, 
	// Process the readRequest.
	function(nodesToRead, dataValues, waterfall_next){
		dataValues.forEach(
			function(datavalue, i) {
				var sc = datavalue.statusCode
				if (sc.value == 0) {
					console.log("Tag [", config.tags[i].name , 
								"] verified. Value = [", 
								datavalue.value.value, "].");
					uaMonitoredNodes.push({
						name: config.tags[i].name,
						nodeId: config.tags[i].node_id,
						updateInterval: config.tags[i].update_interval
					});
				} else {
					console.log("Tag [", config.tags[i].name ,
								"] could not be read. Status = [", sc.name, 
								"], Description = [", sc.description, "].");
				}           
			}
		);
		console.log(uaMonitoredNodes)
		waterfall_next(null);
	}, 
	// Install a subscription and start monitoring
	function(waterfall_next) {
		uaSubscription = new opcua.ClientSubscription(uaSession, {
			requestedPublishingInterval: 1000,
			requestedLifetimeCount: 10,
			requestedMaxKeepAliveCount: 2,
			maxNotificationsPerPublish: 1,
			publishingEnabled: true,
			priority: 10
		});
		uaSubscription.on("started", function() {
			console.log("subscription started for 2 seconds - subscriptionId=", 
						uaSubscription.subscriptionId);
		}).on("keepalive", function() {
			console.log("subscription", uaSubscription.subscriptionId, 
						"keepalive");
		}).on("terminated", function() {
			var err = "subscription" + uaSubscription.subscriptionId +
						   "was terminated" ;
			waterfall_next(err);
		});
		
		// Install a monitored item for each tag in uaMonitoredNodes
		uaMonitoredNodes.forEach(
			function(node){
				var monitoredItem = uaSubscription.monitor({
					nodeId: opcua.resolveNodeId(node.nodeId),
					attributeId: opcua.AttributeIds.Value
				},{	
					clienthandle: 13,
					samplingInterval: node.updateInterval,
					discardOldest: true,
					queueSize: 20
				},
				opcua.read_service.TimestampsToReturn.Both,
				function(err){
					if (err) console.log("ERR ", err);
				});
				
				monitoredItem.on("changed", function(dataValue) {
					var value = {
						"value": dataValue.value.value,
						"time": dataValue.sourceTimestamp.getTime()
					};
					var tags = {
						"opcstatus": dataValue.statusCode.value
					};
					
					wp.AddPointToBuffer({value, tags});
				});
				
				monitoredItem.on("err", function (err_message) {
					console.log(monitoredItem.itemToMonitor.nodeId.toString(), 
								" ERROR :", err_message);
				});
				
				// add the monitored item to the node in the list.
				node.monitoredItem = monitoredItem;
			}
		);
	}
] , function(err, results) {
    if (err) console.log("An error occured:", err);
})

function loadConfig() {
	var path = require("path").resolve(__dirname, 'config.toml');
	var text = require("fs").readFileSync(path, "utf8");
	return toml.parse(text);
}