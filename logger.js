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

// declare OPCUA globals;
var uaClient = new opcua.OPCUAClient()
  , uaSession
  , uaSubscription;


function loadConfig() {
	var path = require("path").resolve(__dirname, 'config.toml');
	var text = require("fs").readFileSync(path, "utf8");
	return toml.parse(text);
}