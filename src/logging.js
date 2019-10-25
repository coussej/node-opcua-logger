const log4js = require('log4js')

// configure loggers
let [ logfile, logfiledays ] = [ process.env.LOG_FILE, process.env.LOG_FILE_DAYS || 10 ]

let appenders = { out: { type: 'stdout' } }
let categories = { default: { appenders: ['out'], level: 'debug' } }
if (logfile) {
  appenders.logfile = { type: 'dateFile', filename: logfile, keepFileExt: true, daysToKeep: logfiledays }
  categories.default.appenders.push('logfile')
}
log4js.configure({ appenders, categories })

let getLogger = log4js.getLogger

module.exports = { getLogger }
