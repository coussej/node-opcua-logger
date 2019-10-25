'use strict'

class Point {
  constructor (value, status, timestamp, metric) {
    this.value = value
    this.status = status
    this.timestamp = timestamp
    this.metric = metric
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

    // // point should only be recorded if it has a good or a differend bad status.
    // if (this.status !== 'Good' && this.metric._lastStatus === this.status) {
    //   return false
    // }

    // this.metric._lastValue = this.value
    // this.metric._lastStatus = this.status
    return true
  }
}

module.exports = Point
