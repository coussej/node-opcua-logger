"use strict"

var async = require("async");
var opcua = require("node-opcua");

function ReadPump(config, measurements, writepump) {
    this.uaServerUrl = config.url;
    this.uaClient;
    this.uaSession;
    this.uaSubscription;
    this.measurements = measurements;
    this.polledMeasurements = [];
    this.monitoredMeasurements = [];
    this.writepump = writepump;
    this.poller;
}

ReadPump.prototype.ConnectOPCUA = function(callback) {
    let self = this;

	const options =
	{
		endpoint_must_exist: false,
		keepSessionAlive: true,
		connectionStrategy:
		{
			maxRetry: 10,
			initialDelay: 2000,
			maxDelay: 10*1000
		}
	};

    this.uaClient = new opcua.OPCUAClient(options);
    self.uaClient.connect(self.uaServerUrl, function(err) {
        if (err) {
            callback(err);
            return;
        }
        self.uaClient.createSession(function(err, session) {
            if (err) {
                callback(err);
                return;
            }
            self.uaSession = session;
            callback(null);
        });
    });
}

ReadPump.prototype.DisconnectOPCUA = function(callback) {
    let self = this;
    if (self.uaSession) {
        self.uaSession.close(function(err) {
            if (err) {
                console.log("session close failed", err);
            }
            self.uaSession = null;
            self.DisconnectOPCUA(callback)
        });
    } else {
        self.uaClient.disconnect(function() {
            callback();
        })
    }
}

ReadPump.prototype.ExecuteOPCUAReadRequest = function(nodes, useSourceTimestamp, callback) {
    let self = this;

    // set a timestamp for the results. If useSourceTimestamp, set t = null.
    // otherwise, round the current timestamp to seconds and convert back to
    // milliseconds
    let t = useSourceTimestamp ? null : Math.round((new Date()).getTime() / 1000) * 1000; // date in ms rounded to the second.

    if (!self.uaSession) {
        callback("The readpump has no active session. Can't read.");
        return;
    }

    self.uaSession.read(nodes, 0, function(err, dataValues) {
        if (err) {
            callback(err, []);
            return;
        }
        let results = []
        dataValues.forEach(
            function(dv, i) {
                let res = dataValueToPoint(nodes[i], dv, t)
                results.push(res);
            }
        );
        callback(null, results);
    });
}

ReadPump.prototype.StartMonitoring = function(callback) {
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
        //console.log("subscription", sub.subscriptionId, "keepalive");
    }).on("terminated", function() {
        let err = "subscription" + sub.subscriptionId + "was terminated";
        console.log(err);
        callback(err);
    });

    // install a monitored item on the subscription for each measurement in
    // the readpump's monitored items.
    self.monitoredMeasurements.forEach(
        function(m) {
            let uaMonitoredItem =
                sub.monitor(
                    m, {
                        clienthandle: 13,
                        samplingInterval: m.monitorResolution,
                        discardOldest: true,
                        queueSize: 1000
                    },
                    opcua.read_service.TimestampsToReturn.Both,
                    function(err) {
                        if (err) callback(err);
                    });
            uaMonitoredItem.on("changed", function(dataValue) {
                let p = dataValueToPoint(m, dataValue);
                if (PointIsValid(p) && PointMatchesType(p)) {
                    self.writepump.AddPointsToBuffer([p]);
                } else {
                    console.log("Invalid point returned from subscription.", PointIsValid(p), PointMatchesType(p));
                }
            });

            uaMonitoredItem.on("err", function(err_message) {
                console.log(uaMonitoredItem.itemToMonitor.nodeId.toString(),
                    " ERROR :", err_message);
            });

            // add the monitored item to the measurement in the list.
            m.uaMonitoredItem = uaMonitoredItem;
        }
    );
}

ReadPump.prototype.StartPolling = function(callback) {
    let self = this;

    // install a schedule that triggers every second.
    let schedule = require('node-schedule');
    let rule = new schedule.RecurrenceRule();
    rule.second = new schedule.Range(0, 59, 1);

    self.poller = schedule.scheduleJob(rule, function() {
        let d = new Date();
        let s = d.getSeconds();

        let nodesToRead = self.polledMeasurements.filter(function(m) {
            return s % m.pollInterval === 0
        });

        if (nodesToRead.length > 0) {
            self.ExecuteOPCUAReadRequest(nodesToRead, false, function(err, results) {
                if (err) {
                    callback(err);
                    return;
                }

                // filter the results. Check for deadband. If all checks pass, set
                // the measurement's lastValue
                results = results.filter(function(p) {
                    if (PointHasGoodOrDifferentBadStatus(p)) {
                        if (!PointIsValid(p) || !PointMatchesType(p)) {
                            // Set de default value for the type specified
                            console.log("Invalid point:", p.measurement.name, p.measurement.nodeId.value, p.value)
                            switch (p.measurement.dataType) {
                                case "boolean":
                                    p.value = false
                                    break;
                                case "number":
                                    p.value = 0
                                    break;
                                case "string":
                                    p.value = ""
                                    break;
                                default:
                                    console.log("No valid datatype, ignoring point")
                                    return false
                            }
                        }

                        // Check for deadband
                        if (PointIsWithinDeadband(p)) return false;

                        if (!PointMatchesType(p)) {
                            console.log('Invalid type returned from OPC. Ignoring point', p)
                            return false
                        }
                        // if we retain the point, we must update the measurment's
                        // last value!
                        p.measurement.lastValue = p.value;
                        p.measurement.lastOpcstatus = p.opcstatus;
                        return true;
                    }
                });
                if (results.length > 0) {
                    self.writepump.AddPointsToBuffer(results);
                }
            });
        }
    });
}

ReadPump.prototype.InitializeMeasurements = function() {
    let self = this;
    self.measurements.forEach(function(m) {
        if (m.hasOwnProperty("collectionType")) {
            switch (m.collectionType) {
                case "monitored":
                    if (m.hasOwnProperty("monitorResolution")) {
                        self.monitoredMeasurements.push({
                            name: m.name,
                            dataType: m.dataType,
                            isArray: m.isArray ? m.isArray : false,
                            arrayIndex: m.arrayIndex,
                            nodeId: m.nodeId,
                            attributeId: opcua.AttributeIds.Value,
                            tags: m.tags,
                            monitorResolution: m.monitorResolution,
                            deadbandAbsolute: m.deadbandAbsolute || 0,
                            deadbandRelative: m.deadbandRelative || 0,
                            lastValue: null,
                            lastOpcstatus: null
                        });
                    } else {
                        console.log("Measurement was specified as monitored but has no monitorResolution", m);
                    }
                    break;
                case "polled":
                    if (m.hasOwnProperty("pollRate") &&
                        m.pollRate >= 1 &&
                        m.pollRate <= 60) {
                        var pollInterval = Math.round(60 / m.pollRate);
                        while (60 % pollInterval !== 0) {
                            pollInterval += 1;
                        }
                        self.polledMeasurements.push({
                            name: m.name,
							dataType: m.dataType,
                            nodeId: m.nodeId,
                            attributeId: opcua.AttributeIds.Value,
                            tags: m.tags,
                            pollInterval: pollInterval,
                            deadbandAbsolute: m.deadbandAbsolute || 0,
                            deadbandRelative: m.deadbandRelative || 0,
                            lastValue: null,
                            lastOpcstatus: null
                        });
                    } else {
                        console.log("Measurement was specified as polled but has no or invalid pollRate", m);
                    }
                    break;
                default:
                    console.log("Invalid collectionType for measurement", m);
            }
        } else {
            console.log("Property collectionType not found for measurement", m);
        }
    });
}

ReadPump.prototype.VerifyMeasurements = function(callback) {
    let self = this;

    async.waterfall([
            // connect opc
            function(waterfall_next) {
                self.ConnectOPCUA(waterfall_next)
            },
            // execute read request
            function(waterfall_next) {
                self.ExecuteOPCUAReadRequest(self.measurements, true, function(err, results) {
                    // For some reason, I can't pass waterfall_next as the callback
                    // function. This however works.
                    waterfall_next(err, results);
                });
            },
            // process read response
            function(results, waterfall_next) {
                results.forEach(
                    function(res, i) {
                        let sc = res.opcstatus
                        let m = res.measurement
                            // If the value could not be read, log. Otherwise, silently
                            // continue adding the measurement.
                        if (sc !== "Good") {
                            console.log("Measurement [", m.name, "] could not be read. Status = [", sc,
                                "]");
                        }
                    }
                );
                waterfall_next(null);
            }
        ],
        // final callback
        function(err) {
            // close and disconnect client
            self.DisconnectOPCUA(function() {
                callback(err);
            })
        });
}

ReadPump.prototype.Run = function(callback) {
    let self = this;

    self.InitializeMeasurements();

    // declare 2 vars to avoid double callbacks
    let monitoringCallbackCalled = false;
    let pollingCallbackCalled = false;
    let reconnectErrorCalled = false;

    async.waterfall([
            // connect opc
            function(waterfall_next) {
                self.ConnectOPCUA(waterfall_next)
            },
            // Start both the monitoring and the polling of the measurments.
            // In case of an error, close everything.
            function(waterfall_next) {
                self.uaClient.on("close", function () {
                    console.log("close and abort");
                    if (!reconnectErrorCalled) {
                        reconnectErrorCalled = true;
                        // close disconnect client
                        self.monitoredMeasurements = [];
                        self.polledMeasurements = [];
                        callback('reconnect failed');
                    }
                });
                async.parallel({
                        monitoring: function(parallel_callback) {
                            // install the subscription
                            self.StartMonitoring(function(err) {
                                console.log("Monitoring error:", err);
                                if (!monitoringCallbackCalled) {
                                    monitoringCallbackCalled = true;
                                    parallel_callback("Monitoring error: " + err);
                                } else {
                                    console.log('WARNING: monitoring callback already called');
                                }
                            });
                        },
                        polling: function(parallel_callback) {
                            // start polling
                            self.StartPolling(function(err) {
                                if (self.poller) self.poller.cancel();
                                self.poller = null;
                                console.log("Polling error:", err);
                                if (!pollingCallbackCalled) {
                                    pollingCallbackCalled = true;
                                    parallel_callback("Polling error: " + err);
                                } else {
                                    console.log('WARNING: polling callback already called');
                                }
                            });
                        }
                    },
                    function(err) {
                        waterfall_next(err);
                    })
            }
        ],
        // final callback
        function(err) {

            // close disconnect client
            self.DisconnectOPCUA(function() {
                callback(err);
            })
        });
}

function dataValueToPoint(measurement, dataValue, customTimestamp) {
    let point;
    if (measurement.isArray == true) {
        if (dataValue.value.value.constructor.name.search("Array") != -1 ) {
            point = {
                measurement: measurement,
                value: dataValue.value ? dataValue.value.value[measurement.arrayIndex] : 0,
                opcstatus: dataValue.statusCode.name,
                timestamp: dataValue.sourceTimestamp ? dataValue.sourceTimestamp.getTime() : (new Date()).getTime()
            };
        }
    } else {
        point = {
            measurement: measurement,
            value: dataValue.value ? dataValue.value.value : 0,
            opcstatus: dataValue.statusCode.name,
            timestamp: dataValue.sourceTimestamp ? dataValue.sourceTimestamp.getTime() : (new Date()).getTime()
        };
    }

    if (customTimestamp) point.timestamp = customTimestamp;

    return point;
}

function PointHasGoodOrDifferentBadStatus(p) {
    let curr = p.opcstatus;
    let prev = p.measurement.lastOpcstatus;

    if (curr === "Good" || curr !== prev) return true;
    return false;
}

function PointIsValid(p) {
    // check if the value is a type that we can handle (number or a bool).
    return (
        ((typeof p.value === "number" || typeof p.value === "boolean") && !isNaN(p.value))
        || typeof p.value === "string"
    )
}

function PointMatchesType(p) {
    // check if the value is a type that we can handle (number or a bool).
    let match = (typeof p.value === p.measurement.dataType)
    if (!match){
        console.log(p.measurement, "Types don't match: ", typeof p.value, p.measurement.dataType)
    }
    return match
}

function PointIsWithinDeadband(p) {
    // some vars for shorter statements later on.
    let curr = p.value;
    let prev = p.measurement.lastValue;

    let dba = p.measurement.deadbandAbsolute;
    let dbr = p.measurement.deadbandRelative;

    // return early if the type of the previous value is not the same as the current.
    // this will also return when this is the first value and prev is still undefined.
    if (typeof curr !== typeof prev) return false;

    // calculate deadbands based on value type. For numbers, make the
    // calculations for both absolute and relative if they are set. For bool,
    // just check if a deadband has been set and if the value has changed.
    switch (typeof curr) {
        case "number":
            if (dba > 0 && Math.abs(curr - prev) < dba) {
                // console.log("New value is within absolute deadband.", p);
                return true;
            }
            if (dbr > 0 && Math.abs(curr - prev) < Math.abs(prev) * dbr) {
                // console.log("New value is within relative deadband.", p);
                return true;
            }
            break;
        case "boolean":
            if (dba > 0 && prev === curr)
            // console.log("New value is within bool deadband.", p);
                return true;
            break;
        case "string":
            break;
        default:
            console.log("unexpected type for deadband calc", p);
    }

    // if we get here, value is not within any deadband. Return false;
    return false;
}

module.exports = ReadPump;
