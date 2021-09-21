'use strict'

const keyspace = require('keyspace')
const window = 1000
const progressWindow = window * 100

exports.defaults = {
  benchmark: {
    n: 1e6,
    valueSize: 100,
    keys: 'seq',
    values: 'random',
    seed: 'seed'
  }
}

exports.plot = require('./clear.plot')

exports.run = function (factory, stream, options) {
  if (options.n < window) {
    throw new RangeError('The "n" option must be >= ' + window)
  } else if (options.n % window !== 0) {
    throw new Error('The "n" option must be a multiple of ' + window)
  }

  const generator = keyspace(options.n, options)

  stream.write('Elapsed (ms), Entries, Bytes, SMA ns/write, CMA entries/s\n')

  function start (db) {
    const startTime = Date.now()
    const inProgress = 0 // TODO: remove
    const totalBytes = 0 // TODO: remove. Can't know

    let totalDeletes = 0
    let timesAccum = 0
    let elapsed

    function report () {
      console.log(
        'Cleared', options.n, 'entries in',
        Math.floor((Date.now() - startTime) / 1e3) + 's'
      )

      stream.end()

      const it = db.iterator()

      it.next(function (err, key) {
        if (err) throw err
        if (key !== undefined) throw new Error('Did not clear all')

        it.end(function (err) {
          if (err) throw err

          db.close(function (err) {
            if (err) throw err
          })
        })
      })
    }

    function clear () {
      if (totalDeletes >= options.n) return report(Date.now() - startTime)

      const start = process.hrtime()
      db.clear({ gte: generator.key(totalDeletes), limit: window }, function (err) {
        if (err) throw err

        const duration = process.hrtime(start)
        const nano = (duration[0] * 1e9) + duration[1]

        timesAccum += nano / window
        totalDeletes += window

        if (totalDeletes % progressWindow === 0) {
          console.log('' + inProgress, totalDeletes,
            Math.round(totalDeletes / options.n * 100) + '%')
        }

        elapsed = Date.now() - startTime
        stream.write(
          elapsed +
          ',' + totalDeletes +
          ',' + totalBytes +
          ',' + (timesAccum / window).toFixed(3) +
          ',' + ((totalDeletes) / (elapsed / 1e3)).toFixed(3) +
          '\n')
        timesAccum = 0
        clear()
      })
    }

    clear()
  }

  factory(function (err, db) {
    if (err) throw err

    let entries = 0

    function loop (err) {
      if (err) throw err

      console.log('Prep: wrote %d of %d entries', entries, options.n)
      if (entries >= options.n) return setTimeout(() => start(db), 500)

      const batch = db.batch()

      for (let i = 0; i < 1e3 && entries < options.n; i++) {
        const key = generator.key(entries++)
        const value = generator.value()

        batch.put(key, value)
      }

      batch.write(loop)
    }

    loop()
  })
}
