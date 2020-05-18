let Influx = require('influx')
let log = require('log4js').getLogger('influx')

let INFLUX = null

async function start (conf) {
  INFLUX = new Influx.InfluxDB(conf.url)
  let host = (await INFLUX.ping(5000))[0]
  if (host.online) {
    log.info(`${host.url.host} responded in ${host.rtt}ms running ${host.version}`)
  } else {
    log.warn(`${host.url.host} is offline :(`)
  }
}

async function write (points) {
  let pts = points.map((p) => {
    let tags = p.tags || {}
    let fields = {}
    tags.status = p.status
    if (p.value.length > 0) {
      for (let i = 0; i < p.value.length; i++) {
        fields['value_' + i] = p.value[i]
      }
    } else {
      fields = { value: p.value }
    }
    if (p.datatype === 'boolean') fields.value_num = p.value * 1
    return {
      measurement: p.measurement,
      tags,
      fields,
      timestamp: p.timestamp
    }
  })

  try {
    await INFLUX.writePoints(pts)
  } catch (e) {
    if (e.message.includes('partial write')) {
      log.warn(e.message)
      return
    }
    log.error(e.message)
    throw e
  }
}
module.exports = { start, write }
