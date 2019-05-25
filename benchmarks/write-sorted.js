'use strict'

const timestamp = require('monotonic-timestamp')
const crypto = require('crypto')
const ldu = require('../lib/level-du')

exports.defaults = {
  benchmark: {
    n: 1e7,
    concurrency: 10,
    valueSize: 256
  }
}

exports.plot = require('./write-sorted.plot')

exports.run = function (factory, stream, options) {
  factory(function (err, db) {
    if (err) throw err

    const value = crypto.randomBytes(options.valueSize) // buffer

    function report (ms) {
      console.log('Wrote', options.n, 'in', Math.floor(ms / 1000) + 's')
      stream.end()

      db.close(function (err) {
        if (err) throw err

        ldu(db, function (err, size) {
          if (err) throw err
          if (size) console.log('Database size:', Math.floor(size / 1024 / 1024) + 'M')
        })
      })
    }

    const startTime = Date.now()

    let inProgress = 0
    let totalWrites = 0
    let writeBuf = ''

    function write () {
      if (totalWrites % 100000 === 0) console.log(inProgress, totalWrites)

      if (totalWrites % 1000 === 0) {
        stream.write(writeBuf)
        writeBuf = ''
      }

      if (totalWrites++ === options.n) return report(Date.now() - startTime)
      if (inProgress >= options.concurrency || totalWrites > options.n) return

      inProgress++

      const key = timestamp()
      const start = process.hrtime()

      db.put(key, value, function (err) {
        if (err) throw err

        const duration = process.hrtime(start)
        const nano = (duration[0] * 1e9) + duration[1]

        writeBuf += (Date.now() - startTime) + ',' + nano + '\n'
        inProgress--
        process.nextTick(write)
      })

      process.nextTick(write)
    }

    write()
  })
}
