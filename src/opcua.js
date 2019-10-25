let opcua = require('node-opcua')
let Point = require('./point.js')
let EventEmitter = require('events')
let ClockTickr = require('clock-tickr')
let path = require('path')

const log4js = require('log4js')
const log = log4js.getLogger('opcuaclient')

//
// OpcuaConnection implements all logic for polling and monitoring a set of
// OPCUA metrics. It keeps track of the connection, polling schedules
// and subscriptions.
//

const TICKR = new ClockTickr({ interval: 1000 })
const EVENTS = new EventEmitter()
const UACLIENT = opcua.OPCUAClient.create({
  applicationName: 'factry-opcua-logger',
  certificateFile: path.join(__dirname, '../certificates/client_selfsigned_cert.pem'),
  clientName: 'factry-opcua-logger',
  connectionStrategy: {
    maxRetry: 3,
    initialDelay: 1000,
    maxDelay: 10000 },
  keepSessionAlive: true,
  endpoint_must_exist: false
})

let UACONNECTIONACTIVE = false
let UASESSION = null
let UASUBSCRIPTION = null

// const SUBSCRIPTIONS = new Map()
const POLL_SCHEDULE = new Map()

for (let i = 0; i < 60; i++) {
  POLL_SCHEDULE.set(i, [])
}
const POLL_ERROR_LIMIT = 5
let POLL_ERROR_COUNT = 0

//
// :: start initialises the opcuaConnection by starting the scheduler
//    and connecting to the opcua server.
//
async function start (config) {
  _startTickr()

  // connect to opcua
  try {
    await _connectUA(config.url, config.user, config.pass)
    // handle connection failure.
    UACLIENT._secureChannel._transport._socket.on('close', () => {
      log.info('Socket was closed!')
      EVENTS.emit('connection_break')
    })
    UACONNECTIONACTIVE = true
  } catch (e) {
    throw new Error(e.message)
  }
}

//
// :: stop removes the event listeners, stops the scheduler and disconnects
//    from the opcua server.
//
async function stop () {
  TICKR.stop()
  _disconnectUA()
}

//
// :: _startTickr creates a map that contains an entry for each second.
//    Whenever there are metrics at that second (added by an event handler),
//    the scheduler triggers a poll at the OPCUA server with those metrics.
//
function _startTickr () {
  // prepare the scheduled polls map with an entry for each second

  // start tickr
  TICKR.on('tick', async (tick) => {
    if (Math.abs(tick.drift) > 500) {
      log.warn('Time travel detected: drift: ' + tick.drift + '. Skipping tick.')
      return
    }
    let ts = new Date(tick.expected)
    let s = ts.getSeconds()
    if (this.prevSeconds && s !== (this.prevSeconds + 1) % 60) {
      log.warn('Tick discrepancy: ' + s + ' vs ' + this.prevSeconds)
    }
    this.prevSeconds = s
    let metrics = POLL_SCHEDULE.get(s)
    if (metrics.length > 0) {
      try {
        await _executePoll(metrics, ts)
        POLL_ERROR_COUNT = 0
      } catch (e) {
        log.error('Could not execute poll.', { Error: e.message })
        POLL_ERROR_COUNT++
      }
    }
    if (POLL_ERROR_COUNT >= POLL_ERROR_LIMIT) {
      log.error('Polling error limit reached!')
      EVENTS.emit('sequential_polling_errors')
    }
  })
  TICKR.start()
}

//
// :: _connectUA connects to the opcua server, creates a session on that
//    server and finally installs a subscription on that session.
//
async function _connectUA (endpointUrl, userName, password) {
  // Connect to the UA server
  await UACLIENT.connect(endpointUrl)
  log.info('Established connection.', { Endpoint: endpointUrl })
  // Establish a session. Use auth when username is set.
  UASESSION = userName ? await UACLIENT.createSession({ userName, password })
    : await UACLIENT.createSession()
  log.info('Established session with server.', { ID: UASESSION.sessionId.value })
  // Install a subscription
  let subOptions = {
    requestedPublishingInterval: 1000,
    requestedLifetimeCount: 10,
    publishingEnabled: true
  }
  UASUBSCRIPTION = opcua.ClientSubscription.create(UASESSION, subOptions)
  UASUBSCRIPTION
    .on('started', () => {
      log.info('Installed subscription on session.', { ID: UASUBSCRIPTION.subscriptionId })
    })
    .on('keepalive', () => { })
    .on('error', () => {
      log.error('Subscription had an error.')
    })
    .on('status_changed', (a, b) => {
      log.info('Subscription status change.', { old: a, new: b })
    })
    .on('terminated', () => {
      log.info('Subscription was terminated.')
    })
}

//
// :: _disconnectUA closes the UA session and disconnects from the server.
//
async function _disconnectUA () {
  // try closing session
  if (UASESSION) {
    try {
      await UASESSION.close()
    } catch (e) {
      log.error('Error closing UA session.', { error: e.message })
    }
  }
  // disconnect client
  await UACLIENT.disconnect()
}

//
// :: _validateMetric tries a single read for a single metric and returns the
//    OPCUA statuscode.
//
// async function _validateMetric (metric) {
//   if (!UACONNECTIONACTIVE || !UASESSION) {
//     throw new Error('There is no active session. Can\'t read')
//   }

//   metric.nodeId = metric.Settings.NodeID // opcua lib expects nodeId on the object
//   let datavalues = await UASESSION.read([metric], 0)
//   let status = datavalues[0].statusCode.name

//   return status
// }

//
// :: _executePoll is called by the scheduler with all metrics that should be
//    polled at a certain timestamp.
//
async function _executePoll (metrics, timestamp) {
  if (!UACONNECTIONACTIVE || !UASESSION) {
    throw new Error('There is no active session. Can\'t read')
  }

  let datavalues = []
  datavalues = await UASESSION.read(metrics, 0)

  let points = []
  datavalues.forEach((dv, i) => {
    let p = _datavalueToPoint(metrics[i], dv, timestamp)
    if (p.shouldRecord()) points.push(p)
  })
  _producePoints(points)
}

//
// :: _datavalueToPoint converts the OPCUA values to a Point
//
function _datavalueToPoint (metric, datavalue, timestamp) {
  let val = datavalue.value ? datavalue.value.value : 0
  let stat = datavalue.statusCode.name
  let ts = timestamp || datavalue.sourceTimestamp
  if (!ts) {
    ts = new Date()
    stat = 'BadNoTimestamp'
  }
  return new Point(val, stat, ts, metric)
}

//
// :: _producePoints emits an event with points
//
function _producePoints (points) {
  EVENTS.emit('points', points)
}

//
// :: addMetric adds a metric to the OPCUA client. The metric is validated if
//    its status is not yet 'validated'. Afterwards, it is added to either the
//    polled or the monitored metrics.
//
async function addMetric (m) {
  if (m.method === 'monitored') {
    _addMonitoredMetric(m)
    return
  }
  _addPolledMetric(m)
}

//
// :: _addPolledMetric adds a metric to polling schedule.
//
function _addPolledMetric (metric) {
  let pi = metric.interval / 1000 > 0 || 5000
    ? Math.min(Math.trunc(metric.interval / 1000), 60) : 5
  while (60 % pi !== 0) {
    pi++
  }
  let po = Math.min(Math.trunc(metric.offset / 1000), 30) || 0
  for (let s = 0; s < 60; s = s + pi) {
    POLL_SCHEDULE.get((s + po) % 60).push(metric)
  }
  log.info('Added Polled Metric.', { measurement: metric.measurement, tags: metric.tags, nodeId: metric.nodeId })
}

//
// :: _addMonitoredMetric adds a metric to the OPCUA subscription.
//
function _addMonitoredMetric (metric) {
  let samplingInterval = metric.interval
    ? Math.max(metric.interval, 1) : 1000

  let uaMonitoredItem = opcua.ClientMonitoredItem.create(
    UASUBSCRIPTION,
    {
      nodeId: metric.nodeId,
      attributeId: opcua.AttributeIds.Value
    }, {
      clienthandle: 13,
      samplingInterval: samplingInterval,
      discardOldest: true,
      queueSize: 100
    }, opcua.TimestampsToReturn.Both)

  uaMonitoredItem
    .on('changed', (datavalue) => {
      let p = _datavalueToPoint(metric, datavalue)
      if (p.shouldRecord()) _producePoints([p])
    })
    .on('err', (err) => {
      log.error('MonitoredItem returned error.', { nodeId: metric.nodeId, error: err })
      setTimeout(() => _addMonitoredMetric(metric), 5000)
    })

  // add the monitored item to the metric, and the metric to the subscriptions.
  metric.uaMonitoredItem = uaMonitoredItem
  log.info('Added Monitored Metric.', { measurement: metric.measurement, tags: metric.tags, nodeId: metric.nodeId })
}

module.exports = { start, stop, addMetric, EVENTS }
