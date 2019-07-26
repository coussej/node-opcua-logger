
WIP v2.

[![JavaScript Style Guide](https://cdn.rawgit.com/standard/standard/master/badge.svg)](https://github.com/standard/standard)

# OPCUA logger for InfluxDB

An application for logging OPCUA data to InfluxDB (and possibly other later). Has been running in production in several factories since mid 2016.

This application will connect to an OPC UA server, subscribe to the measurements in your configuration and log them to an influxdb instance. It first buffers the data in a local db, so that in case influxdb is temporarily unavailable, your data is not lost.

Brought to you by [Factry](www.factry.io).

## Features

* Connect to any OPCUA compatible datasource.
* Support for both polled and monitored logging of values.
* Internal buffering mechanism to avoid data loss when connection to InfluxDB is lost.
* Deploy as a single binary, no need to install dependencies on host system.
* Cross-platform: binaries available for both windows, linux and mac.

## How to run

### From a prebuilt binary

* Download a binary for your OS in the releases section.
* Create a `config.toml` of `config.json` file (see configuration).
* Data!

### From source

* Install a recent version of NodeJS on you system.
* Clone this repository.
* Run `npm install` in the project root.
* Create a `config.toml` of `config.json` file (see configuration).
* Run `npm run start`.
* Data!

## Configuration

### Environment variables

The following settings are optional and controlled by setting environment variables.

* CONFIG_FILE: path to the config file (see below). This defaults to `./config.toml`
* LOG_FILE: when set, the application will also log to this file instead of only to stdout.
* LOG_FILE_DAYS: number of days to keep logfiles. Defaults to 10.  

### Config file

The application expects a config file that contains all the details on which data you want to log. This can either be a TOML or a JSON file, whichever you prefer. The application will look for such a file in the current working directory on startup, unless you specifically specify a seperate path in the environment.

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
```
     
## Contributing

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request

## Credits

* Jeroen Coussement - [@coussej](https://twitter.com/coussej) - [coussej.github.io](http://coussej.github.io) - [factry.io](https://www.factry.io)
* Etienne Rossignon - [@gadz_er](https://twitter.com/gadz_er) - for creating the fantastic [node-opcua](https://github.com/node-opcua/node-opcua) library.


## License

MIT
