const fs = require('fs-extra')
const log = require('log4js').getLogger('buffer')
const path = require('path')

//
// Buffer implements the logging for buffering points in memory, while
// persisting them on disk in situations where the processing is temporarily
// malfunctioning.
//

const DATA_PATH = process.env.DATA_PATH || path.resolve(process.cwd(), 'data')
const QUEUE_PATH = path.resolve(DATA_PATH, '_queue')
const ERROR_PATH = path.resolve(DATA_PATH, '_error')
const WRITE_INTERVAL = process.env.WRITE_INTERVAL || 1000
const WRITE_BATCHSIZE = process.env.WRITE_BATCHSIZE || 1000

let ABORTED = false
let MEMBUFFER = []
let SEQUENTIAL_WRITE_ERRORS = 0
let WRITEFUNC = (points) => console.log(points)

//
// start initialises the buffer by preparing the buffer directories
// and starting the main processing loop.
//
async function start (writefunc) {
  if (writefunc) WRITEFUNC = writefunc
  _prepareDirectories()
  _processBuffer()
}

// stop quits the buffer by quiting the main processing loop
// and persisting the remaining buffer.
async function stop () {
  ABORTED = true
  // persist the remaining buffer
  await _persistBuffer()
}

// addPoints takes an array of points and pushes them to the in-memory buffer.
async function addPoints (points) {
  let pts = points.map((p) => {
    return {
      measurement: p.metric.measurement,
      datatype: p.metric.datatype,
      value: p.value,
      status: p.status,
      timestamp: p.timestamp,
      tags: p.metric.tags || {}
    }
  })
  MEMBUFFER.push(...pts)
}

// _prepareDirectories initializes the directory that will be used to dump
// bufferfiles when processing temporarily fails.
function _prepareDirectories () {
  // create a _queue directory for queued buffer files.
  try {
    fs.ensureDirSync(QUEUE_PATH)
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw new Error('Could not create _queue dir [ ' + QUEUE_PATH +
        ' ]: ' + e.message)
    }
  }

  // create an _error directory for invalid buffer files.
  try {
    fs.ensureDirSync(ERROR_PATH)
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw new Error('Could not create _error dir [ ' + ERROR_PATH +
        ' ]: ' + e.message)
    }
  }
}

// _processBuffer contains the main logic for dealing with the buffered data.
// It checks if the in memory buffer has grown too big and persists it if
// required. After that, it will continue by processing the persisted
// bufferfiles until none are left, after which processing of the in memory
// buffer is resumed.
async function _processBuffer () {
  if (ABORTED) return

  let wait = WRITE_INTERVAL

  // Check if buffer contains more than allowed. If it does, dump the buffer
  // to disk. This should only be the case if there is something wrong with
  // the influx connection.
  if (MEMBUFFER.length > WRITE_BATCHSIZE * 2) {
    await _persistBuffer()
  }

  // check for buffer files
  let files = await fs.readdir(QUEUE_PATH)

  if (files.length > 0) {
    let writeErr = false
    try {
      await _processBufferFile(files[0])
    } catch (e) {
      writeErr = true
    }
    // if there was no error, don't wait.
    if (!writeErr) wait = 0
  } else if (MEMBUFFER.length > 0) {
    let points = MEMBUFFER.splice(0, WRITE_BATCHSIZE)
    try {
      await WRITEFUNC(points)
      if (points.length === WRITE_BATCHSIZE) {
        wait = 0
        log.warn('MaxBatchSize exceeded.', { max: WRITE_BATCHSIZE })
      }
      SEQUENTIAL_WRITE_ERRORS = 0
    } catch (e) {
      log.error('Failed to write points from membuffer.',
        { error: e.message })

      SEQUENTIAL_WRITE_ERRORS++
      wait = SEQUENTIAL_WRITE_ERRORS > 10 ? 20000 : 5000
      log.error(`Will try again in ${wait / 1000}s.`)

      // restore the errored points to the membuffer
      MEMBUFFER.splice(0, 0, ...points)
    }
  }

  setTimeout(() => { _processBuffer() }, wait)
}

// _persistBuffer persists the full contents of the in-memory buffer. It splits
// the content into files that contain at most processbatchsize points.
async function _persistBuffer () {
  log.info('Persisting membuffer.')
  let buffer = MEMBUFFER.splice(0)
  MEMBUFFER = []
  let count = 0
  while (buffer.length > 0) {
    let content = buffer.splice(0, WRITE_BATCHSIZE)
    let ts = Date.now().toString()
    let fp = path.resolve(QUEUE_PATH, ts + '_' + count + '.json')
    try {
      await fs.writeFile(fp, JSON.stringify(content))
      log.info('Buffer persisted.', { bufferfile: fp })
    } catch (e) {
      log.error('Failed to dump buffer.', { error: e.message })
    }
    count++
  }
}

// _processBufferFile takes a single bufferfile name as an argument and
// tries to load and parse that file and write its contents to InfluxDB. If
// loading / parsing / writing fails, the files is moved to the ../_invalid
// folder. If the InfluxDB service is unavailable, an error is thrown.
async function _processBufferFile (bufferFile) {
  let points = []

  let filepathQueue = path.resolve(QUEUE_PATH, bufferFile)
  let filepathInvalid = path.resolve(ERROR_PATH, bufferFile)

  log.info('Start processing of bufferfile', { file: filepathQueue })

  // try loading the bufferfile and parse it to a javascript array.
  let fileError = false
  try {
    let file = await fs.readFile(filepathQueue)
    points = JSON.parse(file)
    points
      .map(p => {
        p.timestamp = new Date(p.timestamp)
        return p
      }) // parse date strings
      .filter(p => !isNaN(p.timestamp)) // remove any invalid dates (should not happen)
  } catch (e) {
    fileError = true
    log.error('Failed to load bufferfile',
      { file: filepathQueue, error: e.message })
  }

  // If the parsing was successful (points.length > 0), we can try processing
  // the points.
  let writeError = false
  if (points.length > 0) {
    try {
      await WRITEFUNC(points)
    } catch (e) {
      if (e.message.indexOf('ERR_INVALID') > -1) {
        writeError = true
        log.error('Invalid request sent.', { error: e.message })
      } else {
        log.error('Error writing points', { error: e.message })
        // throw error up the stack.
        throw new Error('API unavailable.')
      }
    }
  }

  // If there was an error in parsing the file or in writing the file, move it
  // to the _invalid folder. Else, all went well, so delete the bufferfile.
  if (fileError || writeError) {
    try {
      log.info('Moving invalid bufferfile.', { file: filepathQueue })
      await fs.rename(filepathQueue, filepathInvalid)
    } catch (e) {
      log.error('Failed to move bufferfile.',
        { file: filepathQueue, error: e.message })
    }
  } else {
    try {
      log.info('Delete processed bufferfile.', { file: filepathQueue })
      await fs.unlink(filepathQueue)
    } catch (e) {
      log.error('Failed to delete bufferfile.',
        { file: filepathQueue, error: e.message })
    }
  }
}

module.exports = { start, stop, addPoints }
