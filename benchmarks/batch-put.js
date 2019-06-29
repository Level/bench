'use strict'

const crypto = require('crypto')
const ldu = require('../lib/level-du')
const keyTmpl = '0000000000000000'

exports.defaults = {
  benchmark: {
    n: 1e6,
    batchSize: 1e3,
    concurrency: 1,
    valueSize: 100,
    chained: false
  }
}

exports.plot = require('./batch-put.plot')

exports.run = function (factory, stream, options) {
  stream.write('Elapsed (ms), Entries, Bytes, Last 1000 Avg Time, MB/s\n')

  function make16CharPaddedKey () {
    const r = Math.floor(Math.random() * options.n)
    const k = keyTmpl + r

    return k.substr(k.length - 16)
  }

  function start (db) {
    const startTime = Date.now()
    const batchSize = options.batchSize

    let inProgress = 0
    let totalWrites = 0
    let totalBytes = 0
    let timesAccum = 0
    let elapsed

    function report () {
      console.log(
        'Wrote', options.n, 'entries in',
        Math.floor((Date.now() - startTime) / 1000) + 's,',
        (Math.floor((totalBytes / 1048576) * 100) / 100) + 'MB'
      )

      stream.end()

      db.close(function (err) {
        if (err) throw err

        ldu(db, function (err, size) {
          if (err) throw err
          if (size) console.log('Database size:', Math.floor(size / 1024 / 1024) + 'M')
        })
      })
    }

    function write () {
      if (totalWrites >= options.n) return report(Date.now() - startTime)
      if (inProgress >= options.concurrency) return

      inProgress++

      if (totalWrites % 100000 === 0) {
        console.log('' + inProgress, totalWrites,
          Math.round(totalWrites / options.n * 100) + '%')
      }

      // TODO: batchSize should be a multiple of 10
      if (totalWrites % 1000 === 0) {
        elapsed = Date.now() - startTime
        stream.write(
          elapsed +
          ',' + totalWrites +
          ',' + totalBytes +
          ',' + Math.floor(timesAccum / 1000) +
          ',' + (Math.floor(((totalBytes / 1048576) / (elapsed / 1000)) * 100) / 100) +
          '\n')
        timesAccum = 0
      }

      let start

      if (options.chained) {
        const batch = db.batch()

        for (let i = 0; i < batchSize; i++) {
          // TODO: see comment in write.js
          const key = make16CharPaddedKey()
          const value = crypto.randomBytes(options.valueSize).toString('hex')

          batch.put(key, value)
        }

        start = process.hrtime()
        batch.write(onWrite)
      } else {
        const ops = new Array(batchSize)

        for (let i = 0; i < batchSize; i++) {
          // TODO: see comment in write.js
          const key = make16CharPaddedKey()
          const value = crypto.randomBytes(options.valueSize).toString('hex')

          ops[i] = { type: 'put', key, value }
        }

        start = process.hrtime()
        db.batch(ops, onWrite)
      }

      function onWrite (err) {
        if (err) throw err

        const duration = process.hrtime(start)
        const nano = (duration[0] * 1e9) + duration[1]

        totalBytes += (keyTmpl.length + options.valueSize) * batchSize
        totalWrites += batchSize
        timesAccum += nano
        inProgress--

        process.nextTick(write)
      }
    }

    for (let i = 0; i < options.concurrency; i++) write()
  }

  // TODO (once stream is sync): skip setTimeout
  setTimeout(function () {
    factory(function (err, db) {
      if (err) throw err
      start(db)
    })
  }, 500)
}
