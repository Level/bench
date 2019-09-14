'use strict'

const path = require('path')

module.exports = function inject (sqlite3) {
  return function (location, options, callback) {
    let db
    let firstPut = true

    const wrapper = {
      // So that benchmarks can determine the size of the database.
      location,
      status: 'new',

      open: function (options, callback) {
        wrapper.status = 'opening'

        db = new sqlite3.Database(path.join(location, 'sqlite.db'), function (err) {
          if (err) return callback(err)

          db.run('CREATE TABLE bench (key VARCHAR(16), value VARCHAR(200))', function (err) {
            if (err) return callback(err)

            setImmediate(function () {
              wrapper.status = 'open'
              callback(null, wrapper)
            })
          })
        })
      },

      put: function (key, value/*, options */, callback) {
        if (firstPut) {
          firstPut = false

          // TODO: expose this fact to benchmarks
          if (typeof key !== 'string') throw new TypeError('Key type not supported')
          if (typeof value !== 'string') throw new TypeError('Value type not supported')

          if (key.length > 16) throw new RangeError('Key is too long')
          if (value.length > 200) throw new RangeError('Value is too long')
        }

        db.exec(`INSERT INTO bench VALUES("${key}","${value}")`, callback)
      },

      close: function (callback) {
        db.close(callback)
      },

      // Trick reachdown
      _batch: function () {},
      _iterator: function () {}
    }

    return wrapper
  }
}
