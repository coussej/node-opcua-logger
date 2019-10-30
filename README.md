# Influx-OPCUA-logger: An OPCUA Client for logging data to InfluxDB! :electric_plug: :factory:

This application will connect to an OPC UA server, subscribe to the metrics in your configuration and log them to an influxdb instance. It also buffers the data in case influxdb is temporarily unavailable, your data is not lost. Has been running in production in several factories since mid 2016.

Brought to you by [Factry](https://www.factry.io/?utm_source=coussej_github&utm_medium=link&utm_campaign=node-opcua-logger).

[![JavaScript Style Guide](https://cdn.rawgit.com/standard/standard/master/badge.svg)](https://github.com/standard/standard)

:information_source: **This is an alpha release of v2.** Please go ahead and try it out, you can contribute by opening issues if you find any bugs!

## Features

* Connect to any OPCUA compatible datasource.
* Support for both polled and monitored logging of values.
* Logs numbers, booleans and strings. For booleans, the value is recorded as a boolean, but a field `value_num` is added containing 1/0 depending on the `value`.
* Internal buffering mechanism to avoid data loss when connection to InfluxDB is lost.
* Deploy as a single binary, no need to install dependencies on host system.
* Cross-platform: binaries available for both windows, linux and mac.

## How to run

### From a prebuilt binary

* Download a binary for your OS in the release section of this repo.
* Create a `config.toml` of `config.json` file (see configuration).
* Data!

### From source

* Install the latest version of NodeJS v10 on you system.
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
* DATA_PATH: a directory path in which to store  the buffer files. By default, a `./data` folder will be created in the current working directory   

### Config file

The application expects a config file that contains all the details on which data you want to log. This can either be a TOML or a JSON file, whichever you prefer. The application will look for such a file in the current working directory on startup, unless you specifically specify a seperate path in the environment. The contents of the file will be validated against the JSON Schema in the src/schema folder. For reference, two example config files are provided in the example_config folder.

 A config file consists of 2 sections. In the first part, you specify the connection details to both the OPCUA server and the InfluxDB server:

```
# The OPCUA connection parameters. If you want to use anonymous auth, 
# remove the username and password lines.
[opcua]
url             = "opc.tcp://localhost:53530/OPCUA/SimulationServer"
user            = "test"
pass            = "test1"

# The InfluxDB connection parameters. Use a connection url containing all 
# details, ie. http(s)://user:password@host:port/database
[influx]
url              = "http://user:password@localhost:8086/opcua"
writeInterval    = 1000          # optional. defaults to 1000ms
writeMaxPoints   = 1000          # optional. defaults to 1000 points

```

In the second part, you specify which metrics to collect. For each such metric, you can specify an objects in the `[[metrics]]` list, like below. A metric should have the following properties:
* **measurement**: the name under which the values of this metrics should be stored in InfluxDB
* **datatype**: the datatype of the values. This is either `number`, `boolean` or `string`.
* **tags**: a list of metadata tags to be stored in InfluxDB. The collector will automatically add a tag with the OPCUA status of each datavalue.
* **nodeId**: the nodeId of the datavalue in the OPCUA Server.
* **method**: how this metric should be collected. There are 2 possibilities:
  * `polled`: collect the value of the metric at regular `interval`s, for example each second. The resulting datapoint will get the timestamp at which the poll was initiated.
  * `monitored`: subscribe to the value in the OPCUA server, and receive it's value when it has changed. This is mostly used for boolean data (like valve positions) or string data (like batchnumbers).
  * `interval`: the data collection interval in milliseconds. Currently, only second level intervals are supported, and they are rounded so they match a 1 minute cycle. For example 1000ms will stay as such, 9000 ms will be rounded to 10000ms, 25000ms will be rounded tot 30000ms.  

```
# For each metrics you want to collect, add a [[metrics]] object.
[[metrics]]
measurement        = "polled1"
datatype           = "number"
tags               = { simulation = "true", location = "ghent" }
nodeId             = "ns=5;s=Sinusoid1"
method             = "polled"
interval           = 1000     

[[metrics]]
measurement        = "monitored2"
datatype           = "boolean"
tags               = { simulation = "true", location = "ghent" }
nodeId             = "ns=3;s=BooleanDataItem"
method             = "monitored"
interval           = 5000  
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

## Disclaimer
The logger contains a 'phone home' functionality, where it sends anonymous usage data to us (# metrics and runtime), so we can get an idea of how much it is being used. If you don't want this, you can set DISABLE_ANALYTICS=true in the environment.

## License

MIT
