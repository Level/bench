'use strict'

const keyspace = require('keyspace')
const ldu = require('../lib/level-du')
const window = 1000
const progressWindow = window * 100

exports.defaults = {
  benchmark: {
    n: 1e6,
    concurrency: 1,
    valueSize: 100,
    buffers: false,
    keys: 'random',
    values: 'random',
    seed: 'seed'
  }
}

exports.plot = require('./iterate.plot')

exports.run = function (factory, stream, options) {
  if (options.n < window) {
    throw new RangeError('The "n" option must be >= ' + window)
  } else if (options.n % window !== 0) {
    throw new Error('The "n" option must be a multiple of ' + window)
  }

  const generator = keyspace(options.n, options)

  stream.write('Elapsed (ms), Entries, Bytes, ns/read, CMA MB/s\n')

  function start (db) {
    const startTime = Date.now()

    let inProgress = 0
    let totalReads = 0
    let totalBytes = 0
    let timesAccum = 0
    let elapsed

    function report () {
      console.log(
        'Iterated', options.n, 'entries in',
        Math.floor((Date.now() - startTime) / 1e3) + 's,',
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

    function iterate () {
      if (totalReads >= options.n) return report(Date.now() - startTime)
      if (inProgress >= options.concurrency) return

      inProgress++

      const it = db.iterator({
        keyAsBuffer: options.buffers,
        valueAsBuffer: options.buffers
      })

      function loop () {
        if (totalReads >= options.n) return end()
        const start = process.hrtime()

        it.next(function (err, key, value) {
          if (err) throw err
          if (key === undefined && value === undefined) return end()

          const duration = process.hrtime(start)
          const nano = (duration[0] * 1e9) + duration[1]

          timesAccum += nano
          totalBytes += Buffer.byteLength(key) + Buffer.byteLength(value)
          totalReads++

          if (totalReads % progressWindow === 0) {
            console.log('' + inProgress, totalReads,
              Math.round(totalReads / options.n * 100) + '%')
          }

          if (totalReads % window === 0) {
            elapsed = Date.now() - startTime
            stream.write(
              elapsed +
              ',' + totalReads +
              ',' + totalBytes +
              ',' + (timesAccum / window).toFixed(3) +
              ',' + ((totalBytes / 1048576) / (elapsed / 1e3)).toFixed(3) +
              '\n')
            timesAccum = 0
          }

          loop()
        })
      }

      function end () {
        const method = typeof it.close === 'function' ? 'close' : 'end'

        it[method](function (err) {
          if (err) throw err
          inProgress--
          process.nextTick(iterate)
        })
      }

      loop()
    }

    for (let i = 0; i < options.concurrency; i++) iterate()
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
