'use strict'

const keyspace = require('keyspace')
const ldu = require('../lib/level-du')
const window = 1000
const progressWindow = window * 100

exports.defaults = {
  benchmark: {
    n: 1e6,
    batchSize: 1e3,
    concurrency: 1,
    valueSize: 100,
    chained: false,
    keys: 'random',
    values: 'random',
    seed: 'seed'
  }
}

exports.plot = require('./put.plot')

exports.run = function (factory, stream, options) {
  if (options.batchSize <= 0 || options.batchSize > window) {
    throw new RangeError('The "batchSize" option must be > 0 <= ' + window)
  } else if (options.batchSize % 10 !== 0) {
    throw new Error('The "batchSize" option must be a multiple of 10')
  } else if (options.batchSize > options.n) {
    throw new RangeError('The "batchSize" option must be <= n')
  } else if (options.n % options.batchSize !== 0) {
    throw new Error('The "n" option must be a multiple of "batchSize"')
  }

  const generator = keyspace(options.n, options)

  stream.write('Elapsed (ms), Entries, Bytes, SMA ms/write, CMA MB/s\n')

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
        ((Date.now() - startTime) / 1e3).toFixed(2) + 's,',
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

      if (totalWrites % progressWindow === 0) {
        console.log('' + inProgress, totalWrites,
          Math.round(totalWrites / options.n * 100) + '%')
      }

      if (totalWrites % window === 0) {
        elapsed = Date.now() - startTime
        stream.write(
          elapsed +
          ',' + totalWrites +
          ',' + totalBytes +
          ',' + (timesAccum / window / 1e6).toFixed(3) +
          ',' + ((totalBytes / 1048576) / (elapsed / 1e3)).toFixed(3) +
          '\n')
        timesAccum = 0
      }

      let start

      if (options.chained) {
        const batch = db.batch()

        for (let i = 0; i < batchSize; i++) {
          const key = generator.key(totalWrites++)
          const value = generator.value()

          // TODO: see comment in put.js
          totalBytes += Buffer.byteLength(key) + Buffer.byteLength(value)
          batch.put(key, value)
        }

        start = process.hrtime()
        batch.write(onWrite)
      } else {
        const ops = new Array(batchSize)

        for (let i = 0; i < batchSize; i++) {
          const key = generator.key(totalWrites++)
          const value = generator.value()

          // TODO: see comment in put.js
          totalBytes += Buffer.byteLength(key) + Buffer.byteLength(value)
          ops[i] = { type: 'put', key, value }
        }

        start = process.hrtime()
        db.batch(ops, onWrite)
      }

      function onWrite (err) {
        if (err) throw err

        const duration = process.hrtime(start)
        const nano = (duration[0] * 1e9) + duration[1]

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
