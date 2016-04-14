# node-opcua-logger
A logger for logging OPCUA data to InfluxDB (and possibly other later).

> Note: still experimental, breaking changes to be expected !!!

<<<<<<< HEAD
This application will connect to an OPC UA server, subscribe to the measurements in your configuration and log them to an influxdb instance. It first buffers the data in a local db, so that in case influxdb is temporarily unavailable, your data is not lost.
=======
This application will connect to an OPC UA server, subscribe to the tags in your configuration and log them to an influxdb instance. It first buffers the data in a local db, so that in case influxdb is temporarily unavailable, your data is not lost.
>>>>>>> 27d727ed46ab95af9abcb74e6edffe982eb67e50

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
<<<<<<< HEAD
url             = "opc.tcp://opcua.demo-this.com:51210/UA/SampleServer"
failoverTimeout = 5000     # time to wait before reconnection in case of failure
=======
url = "opc.tcp://opcua.demo-this.com:51210/UA/SampleServer"
>>>>>>> 27d727ed46ab95af9abcb74e6edffe982eb67e50
```

In the output section, specify the connection details for influxdb:

```
[output]
name             = "influx_1"
type             = "influxdb"
<<<<<<< HEAD
host             = "127.0.0.1"
=======
host             = "178.62.237.81"
>>>>>>> 27d727ed46ab95af9abcb74e6edffe982eb67e50
port             = 8086
protocol         = "http"
username         = ""
password         = ""
database         = "test"
<<<<<<< HEAD
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
=======
failoverTimeout  = 10000   # Time after which the logger will reconnect
buffer_max_size  = 64      # Max size of the local db in MB. TODO.
write_interval   = 3000    # Interval of batch writes.
write_max_points = 1000    # Max point per POST request.
```

Then, for each OPC value you want to log, repeat the following in the config file:

```
[[tags]]
name            = "An Int32"      # This will also be the measurement name in InfluxDb.
node_id         = "ns=2;i=10849"  # The nodeID.
update_interval = 10              # The requested resolution in milliseconds.
>>>>>>> 27d727ed46ab95af9abcb74e6edffe982eb67e50
```

## Run

```
$ node logger.js
<<<<<<< HEAD
```
=======
```
>>>>>>> 27d727ed46ab95af9abcb74e6edffe982eb67e50
