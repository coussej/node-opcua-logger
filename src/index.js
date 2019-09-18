const log = require('./logging.js').getLogger('main')
const config = require('./config.js')
const influx = require('./influx.js')
const buffer = require('./buffer.js')
const opcua = require('./opcua.js')

let conf = config.load()

// Catch all 'bad' events and try a gracefull shutdown

async function gracefullShutdown (e) {
  log.fatal(e)
  await buffer.stop()
  process.exit(-1)
}

opcua.EVENTS.on('connection_break', async () => { await gracefullShutdown('connection_break') })
opcua.EVENTS.on('sequential_polling_errors', async () => { await gracefullShutdown('sequential_polling_errors') })
process.on('SIGTERM', async () => { await gracefullShutdown('received SIGTERM') })
process.on('SIGINT', async () => { await gracefullShutdown('received SIGINT') })

// MAIN LOGIC IN IIFE

;(async () => {
  try {
    //
    // Init influxclient
    //

    log.info('Initialising influxClient')
    await influx.start(conf.influx.url)

    //
    // Create and start the buffer.
    //

    log.info('Initialising buffer')
    await buffer.start(influx.write)

    //
    // Create and start the OPCUA connection.
    //

    log.info('Connecting OPCUA')
    await opcua.start(conf.opcua.url)
    opcua.EVENTS.on('points', (pts) => buffer.addPoints(pts))

    //
    // Add all metrics to the OPCUA Session
    //
    for (let m of conf.metrics) {
      opcua.addMetric(m)
    }
  } catch (e) {
    gracefullShutdown(e)
  }
})()
