'use strict'

const du = require('du')
const reachdown = require('./reachdown')

// TODO: move to package
module.exports = function ldu (db, callback) {
  const location = reachdown(db).location

  if (!location) {
    return process.nextTick(callback, null, null)
  }

  du(location, callback)
}
