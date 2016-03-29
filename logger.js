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

// Declare OPCUA globals;
var uaSession;
var uaSubscription;
var uaClient;

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
			// function to read(). This does work.
			waterfall_next(err, nodesToRead, dataValues);
		});
	}, 
	// Process the readRequest.
	function(nodesToRead, dataValues, waterfall_next){
		dataValues.forEach(function(datavalue, i) {
			var sc = datavalue.statusCode
			if (sc.value == 0) {
				console.log("Tag [", config.tags[i].name , "] verified. Value = [", datavalue.value.value, "].");
			} else {
				console.log("Tag [", config.tags[i].name , "] could not be read. Status = [", sc.name, "], Description = [", sc.description, "].");
			}           
		});
		waterfall_next(null, 'done');
	}
] , function(err, results) {
    if (err) console.log("An error occured:", err);
})

function loadConfig() {
	var path = require("path").resolve(__dirname, 'config.toml');
	var text = require("fs").readFileSync(path, "utf8");
	return toml.parse(text);
}