let { InfluxDB, Point } = require('@influxdata/influxdb-client')
let log = require('log4js').getLogger('influx')

let INFLUX = null
let ORG, BUCKET

async function start (conf) {
  INFLUX = new InfluxDB({ url: conf.url, token: conf.token })
  ORG = conf.org
  BUCKET = conf.bucket

  // let host = (await INFLUX.ping(5000))[0]
  // if (host.online) {
  //   log.info(`${host.url.host} responded in ${host.rtt}ms running ${host.version}`)
  // } else {
  //   log.warn(`${host.url.host} is offline :(`)
  // }
}

async function write (points) {
  let writeApi = INFLUX.getWriteApi(ORG, BUCKET)

  for (let p of points) {
    let pt = new Point(p.measurement)
    let tags = p.tags || {}
    tags.status = p.status
    for (let t in tags) {
      pt.tag(t, tags[t])
    }

    let assignfunc
    switch (p.datatype) {
      case 'number':
        assignfunc = pt.floatField.bind(pt)
        break
      case 'boolean':
        assignfunc = pt.booleanField.bind(pt)
        break
      default:
        assignfunc = pt.stringField.bind(pt)
    }

    if (p.value.length > 0) {
      for (let i = 0; i < p.value.length; i++) {
        assignfunc('value_' + i, p.value[i])
        if (p.datatype === 'boolean') assignfunc('value_num_' + i, p.value[i] * 1)
      }
    } else {
      console.log(p.value, assignfunc)
      assignfunc('value', p.value)
      if (p.datatype === 'boolean') assignfunc('value_num', p.value * 1)
    }

    writeApi.writePoint(pt)
  }

  try {
    await writeApi.close()
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
