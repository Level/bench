'use strict'

const reachdown = require('reachdown')

module.exports = function (db, start, end, callback) {
  db = reachdown(db, function visit (db) {
    return typeof db.compactRange === 'function'
  })

  if (!db) {
    return process.nextTick(callback)
  }

  db.compactRange(start, end, callback)
}
