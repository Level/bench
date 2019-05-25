'use strict'

// TODO: move to package (shared with subleveldown, level-test)
module.exports = function reachdown (db, type) {
  if (typeof db.down === 'function') return db.down(type)
  if (type && db.type === type) return db
  if (isLooseAbstract(db.db)) return reachdown(db.db, type)
  if (isLooseAbstract(db._db)) return reachdown(db._db, type)
  return type ? null : db
}

function isLooseAbstract (db) {
  if (!db || typeof db !== 'object') return false
  return typeof db.status === 'string' && typeof db._iterator === 'function'
}
