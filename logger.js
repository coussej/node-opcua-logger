var async = require("async");
var influx = require("influx");
var opcua = require("node-opcua");
var writepump = require("./writepump.js");

// load configuration
var config = require("./config.json");
console.log(config);

// Get a writepump for the output and start it.
var wp = new writepump(config.output);
wp.Start();

// declare OPCUA globals;
var uaClient = new opcua.OPCUAClient()
  , uaSession
  , uaSubscription;


