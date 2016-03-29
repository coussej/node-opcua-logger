var async = require("async");
var influx = require("influx");
var nedb = require("nedb");

function WritePump(config) {
	var dbname = config.name + ".db";
	var path = require('path').resolve(__dirname, dbname);
	
	this.name = config.name;
	this.config = config;
	this.buffer = new nedb({ 
		filename: path, 
		autoload: true 
	});
	this.output = new influx({
		  host :     config.host,
		  port :     config.port, // optional, default 8086
		  protocol : config.protocol, // optional, default 'http'
		  username : config.username,
		  password : config.password,
		  database : config.database
	});
}

/**
 * Start the instance's writepump.
 */
WritePump.prototype.Start = function() {
	var name = this.name;
	var buff = this.buffer;
	var outp = this.output;
	var conf = this.config;
	
	var writeLimit = this.config.write_max_points || 1000;
	var writeInterval = this.config.write_interval || 5000;
	
	console.log(name, ": starting writepump [ writeLimit: ", writeLimit, ", writeInterval:", writeInterval, "].")
	
	async.forever(
		function(forever_next) {
			async.waterfall([
				function(waterfall_next) {
					buff.find({})
					    .limit(writeLimit)
					    .exec(waterfall_next);
				},
				function(docs, waterfall_next) {
					console.log(name, ": found", docs.length, "records in buffer.");
					var ids = [];
					docs.forEach(function(doc) {
						ids.push(doc._id);
					});
					// TODO: this is where we should send the data towards 
					// influxDB. If succesfull, we pass the ids to the delete 
					// function. If not, we try again next iteration.
					waterfall_next(null, ids);
				},
				function(ids, waterfall_next) {
					buff.remove({_id: { $in: ids } }, { multi: true	}, waterfall_next)
				}
			], function (err, numberProcessed) {
				if (err) {
					console.log(name, err)
				}
				var wait = numberProcessed == writeLimit ? 0 : writeInterval
				if (wait > 0) {
					// now is a good time to compact the buffer.
					buff.persistence.compactDatafile();
				}
				setTimeout(forever_next, wait);
			}
		)},
		function(err) {
			if (err) console.log(name, err);
		}
	);
}

/**
 * Adds a datapoint to the instance's writebuffer.
 * @param {Datapoint} point
 */
WritePump.prototype.AddPointToBuffer = function(point) { 
	this.buffer.insert(point, function (err, newDoc) {   
		if (err) console.log(this.name, "Error writing to buffer. Point:", point, ", Err:", err);
	});
}

module.exports = WritePump;