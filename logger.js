var async = require("async");
var influx = require("influx");
var opcua = require("node-opcua");

// load configuration
var config = loadConfig();

// initialize local datastore for buffering
var bufferdb = initBufferdb();

// initialize influxdb http API
var influxclient = influx(config.influxdb);

// declare OPCUA globals;
var uaClient = new opcua.OPCUAClient()
  , uaSession
  , uaSubscription;

// start writepump from buffer to influxdb. 
writePump(bufferdb,influxclient)

// start OPCUA session and install subscriptions for the tags in config
// TODO.

function loadConfig() {
  // TODO: get this from config file.
  var config = {
    "server": "opc.tcp://opcua.demo-this.com:51210/UA/SampleServer",
    "tags": [{
      "name": "An Int32",
      "nodeId": "ns=2;i=10849",
      "updateInterval": 100
    },{
      "name": "An Int16",
      "nodeId": "ns=2;i=10219",
      "updateInterval": 1000
    }],
    "influxdb": {
      "host": "188.166.28.165",
      "port": 8086, // optional, default 8086
      "protocol": "http", // optional, default 'http'
      "username": "",
      "password": "",
      "database": "test"
    }
  };
  // TODO: verify that config contains the correct elements
  return config;
};

function initBufferdb() {
  var datastore = require('nedb')
    , path = require('path').resolve(__dirname, 'buffer.db')
    , bufferdb = new datastore({ filename: path, autoload: true });
  return bufferdb;
};

function writePump(bufferdb, influxdb) {
  var writeInterval  = 2000
    , pointsPerWrite = 2;
  async.forever(
    function(next) {
      bufferdb.find({}).limit(pointsPerWrite).exec(function (err, docs) {
        if (docs.length > 0) {
          console.log("buffer found records!", docs);
          var ids = []; 
          docs.forEach(function(doc){
            ids.push(doc._id);
          });
          console.log("IDs:", ids);
          bufferdb.remove({_id : {$in : ids}}, { multi: true }, function (err, numRemoved) {
            console.log("buffer deleted!", numRemoved);
            // If we removed the max possible rows, it means more rows are left.
            // Immediately do another write.
            if (numRemoved == pointsPerWrite) {
              next();
            } else {
              setTimeout(next, writeInterval);
            }
          });
        } else {
          setTimeout(next, writeInterval);
        }    
      });
    },
    function(err) {}
  );
}

function readPump