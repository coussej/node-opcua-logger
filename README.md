# node-opcua-logger
A logger for logging OPCUA data to InfluxDB (and possibly other later).

> Note: still experimental, breaking changes to be expected !!!

This application will connect to an OPC UA server, subscribe to the measurements in your configuration and log them to an influxdb instance. It first buffers the data in a local db, so that in case influxdb is temporarily unavailable, your data is not lost.

## Installation

Make sure you have a recent version of node installed (>4), then execute the following commands.

```
$ git clone https://github.com/coussej/node-opcua-logger.git
$ cd node-opcua-logger
$ npm install
```

## Configuration

Modify the `config.toml` file to match your configuration. The input section should contain the url of the OPC server (no advanced authentication supported yet).

```
[input]
url             = "opc.tcp://opcua.demo-this.com:51210/UA/SampleServer"
failoverTimeout = 5000     # time to wait before reconnection in case of failure
```

In the output section, specify the connection details for influxdb:

```
[output]
name             = "influx_1"
type             = "influxdb"
host             = "127.0.0.1"
port             = 8086
protocol         = "http"
username         = ""
password         = ""
database         = "test"
failoverTimeout  = 10000     # Time after which the logger will reconnect
bufferMaxSize    = 64        # Max size of the local db in MB. TODO.
writeInterval    = 3000      # Interval of batch writes.
writeMaxPoints   = 1000      # Max point per POST request.
```

Then, for each OPC value you want to log, repeat the following in the config file, d:

```
# A polled node:
[[measurements]]
name               = "Int32polled"
tags               = { tag1 = "test", tag2 = "AB43" }
nodeId             = "ns=2;i=10849"
collectionType     = "polled"
pollRate           = 20     # samples / minute.
deadbandAbsolute   = 0      # Absolute max difference for a value not to be collected
deadbandRelative   = 0.0    # Relative max difference for a value not to be collected

# A monitored node
[[measurements]]
name               = "Int32monitored"
tags               = { tag1 = "test", tag2 = "AB43" }
nodeId             = "ns=2;i=10849"
collectionType     = "monitored"
monitorResolution  = 1000    # ms 
deadbandAbsolute   = 0 		# Absolute max difference for a value not to be collected
deadbandRelative   = 0    	# Relative max difference for a value not to be collected
```

## Run

```
$ node logger.js
```
