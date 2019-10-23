const uuidv4 = require('uuid/v4')
const fs = require('fs-extra')
const path = require('path')
const ua = require('universal-analytics')

let uuid
let visitor
let appStart = new Date()
let metrics = 0

async function start (metricCount) {
  metrics = metricCount
  if (!visitor) {
    let clientID = await getInstanceUUID()
    visitor = ua('UA-81483531-4', clientID)
    visitor.pageview('/influx-opcua-logger/' + require('../package.json').version).send()
    setInterval(_sendHeartbeat, 10000)
  }
}

async function _sendHeartbeat () {
  let elapsedSeconds = Math.round((new Date() - appStart) / 1000)
  if (!visitor) return
  visitor.event({
    ec: 'App Events',
    ea: 'Hourly Heartbeat',
    cm1: metrics, // #metrics
    cm2: elapsedSeconds
  }).send(err => console.log(err))

  console.log({
    ec: 'App Events',
    ea: 'Hourly Heartbeat',
    cm1: metrics, // #metrics
    cm2: elapsedSeconds
  })
}

async function getInstanceUUID () {
  if (uuid) return uuid
  const dataPath = process.env.DATA_PATH || path.resolve(process.cwd(), 'data')
  const uuidFile = path.resolve(dataPath, '.instance-uuid')
  if (await fs.exists(uuidFile)) {
    let fileContents = (await fs.readFile(uuidFile)).toString()
    if (fileContents.length === 36) {
      uuid = fileContents
      return uuid
    }
  }
  uuid = uuidv4()
  await fs.writeFile(uuidFile, uuid)
  return uuid
}

module.exports = { start }
