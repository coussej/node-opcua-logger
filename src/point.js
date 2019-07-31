'use strict'

class Point {
  constructor (value, status, timestamp, metric) {
    this.value = value
    this.status = status
    this.timestamp = timestamp || (new Date()).getTime()
    this.metric = metric
  }

  isWithinDeadband () {
    // some vars for shorter statements later on.
    let curr = this.value
    let prev = this.metric.lastValue

    let dba = this.metric.DeadbandAbsolute || 0
    let dbr = this.metric.DeadbandRelative || 0

    // return early if the type of the previous value is not the same as the current.
    // this will also return when this is the first value and prev is still undefined.
    if (typeof curr !== typeof prev) return false

    // calculate deadbands based on value type. For numbers, make the
    // calculations for both absolute and relative if they are set. For bool,
    // just check if a deadband has been set and if the value has changed.
    switch (typeof curr) {
      case 'number':
        if (dba > 0 && Math.abs(curr - prev) < dba) {
          // console.log("New value is within absolute deadband.", p);
          return true
        }
        if (dbr > 0 && Math.abs(curr - prev) < Math.abs(prev) * dbr) {
          // console.log("New value is within relative deadband.", p);
          return true
        }
        break
      case 'boolean':
        if (dba > 0 && prev === curr) { return true }
        break
      case 'string':
        break
      default:
        console.log('unexpected type for deadband calc', this.metric.name, this.value)
    }

    // if we get here, value is not within any deadband. Return false;
    return false
  }

  shouldRecord () {
    switch (this.metric.datatype) {
      case 'number':
        if (typeof this.value !== 'number' || !isFinite(this.value)) {
          this.value = 0
          if (this.status === 'Good') this.status = 'BadInvalidDataType'
        }
        break
      case 'string':
        if (typeof this.value !== 'string') {
          this.value = ''
          if (this.status === 'Good') this.status = 'BadInvalidDataType'
        }
        break
      case 'boolean':
        if (typeof this.value !== 'boolean') {
          this.value = false
          if (this.status === 'Good') this.status = 'BadInvalidDataType'
        }
        break
      default:
        console.error('Measurement %s has unknown datatype %s.',
          this.metric.ID, this.metric.Datatype)
        return false
    }

    // point should only be recorded if it has a good or a differend bad status.
    if (this.status !== 'Good' && this.metric._lastStatus === this.status) {
      return false
    }

    this.metric._lastValue = this.value
    this.metric._lastStatus = this.status
    return true
  }
}

module.exports = Point
