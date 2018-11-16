"use strict"

let async = require("async");
let influx = require("influx");
let nedb = require("nedb");

function WritePump(config) {
	let dbname = config.name + ".db";
	let dir = process.env.BUFFER_LOCATION || __dirname
	let path = require('path').resolve(dir, dbname);
	
	this.name = config.name;
	this.config = config;
	this.buffer = new nedb({ 
		filename: path, 
		autoload: true 
	});
	this.output = new influx.InfluxDB({
		host :           config.host,
		port :           config.port, // optional, default 8086
		protocol :       config.protocol, // optional, default 'http'
		username :       config.username,
		password :       config.password,
		options  :       {timeout: config.failoverTimeout}
	});
}

/**
 * Start the instance's writepump.
 */
WritePump.prototype.Run = function() {
	let self = this;
	
	let writeLimit = self.config.writeMaxPoints || 1000;
	let writeInterval = self.config.writeInterval || 5000;
	
	console.log(self.name, ": starting writepump [ writeLimit: ", writeLimit, ", writeInterval:", writeInterval, "].")
	
	async.forever(
		function(forever_next) {
			async.waterfall([
				function(waterfall_next) {
					self.buffer.find({})
						       .limit(writeLimit)
					           .exec(waterfall_next);
				},
				function(docs, waterfall_next) {
					//console.log(name, ": found", docs.length, "records in buffer.");
					let ids = [];
					let series = [];
					docs.forEach(function(doc) {
						ids.push(doc._id);
						series.push({
							measurement: doc.s,
							tags: doc.t,
							fields: {value: doc.v.value},
							timestamp: new Date(doc.v.time),
						});
					});
					
					self.output.writePoints(series, {database : self.config.database})
					.then(() => {
						waterfall_next(null, ids);
					})
					.catch(err => {
						waterfall_next(err, ids);
					})
				},
				function(ids, waterfall_next) {
					self.buffer.remove({_id: { $in: ids } }, { multi: true	}, waterfall_next)
				}
			], function (err, numberProcessed) {
				if (err) {
					console.log(self.name, err)
					if (err.toString().search("database not found") != -1) {
						console.log('Create Database ' + self.config.database);
						self.output.createDatabase(self.config.database);
					}
				}
				let wait = numberProcessed == writeLimit ? 0 : writeInterval
				if (wait > 0) {
					// now is a good time to compact the buffer.
					self.buffer.persistence.compactDatafile();
				} else {
					console.log("Warning: buffer exceeded writeLimit");
				}
				setTimeout(forever_next, wait);
			}
		)},
		function(err) {
			if (err) console.log(self.name, err);
		}
	);
}

/**
 * Adds a datapoint to the instance's writebuffer.
 * @param {Datapoint} point
 */
WritePump.prototype.AddPointsToBuffer = function(points) {
	let self = this;
	// points must be transformed to only the required info, otherwise 
	// buffer overhead would be to large. Immediatly transform to a format 
	// that is easy for influx later on.
	points.forEach(
		function (p) {
			let entry = {
				s: p.measurement.name, 
				v: {
					value: p.value,
					time: p.timestamp
				}, 
				t: p.measurement.tags
			};
			// opc status should also be included in tags.
			entry.t.opcstatus = p.opcstatus;
			self.buffer.insert(entry, function (err, newDoc) {   
				if (err) console.log(this.name, "Error writing to buffer. Entry:", entry, ", Err:", err);
			});
		}
	);
}

module.exports = WritePump;
