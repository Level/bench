'use strict'

const keyspace = require('keyspace')
const bytes = require('bytes')
const ldu = require('../lib/level-du')
const lcompact = require('../lib/level-compact')
const window = 1000
const progressWindow = window * 100

exports.defaults = {
  benchmark: {
    n: 1e6,
    concurrency: 1,
    valueSize: 100,
    nextv: false,
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

  const writeGenerator = keyspace(options.n, Object.assign({}, options, {
    // Writing ordered data in reverse is the fastest (at least in LevelDB)
    keys: 'seqReverse'
  }))

  const useNextv = !!options.nextv
  const nextvSize = useNextv && typeof options.nextv !== 'boolean' ? parseInt(options.nextv, 10) : 1e3
  const iteratorOptions = {}

  if (options.keyEncoding) iteratorOptions.keyEncoding = options.keyEncoding
  if (options.valueEncoding) iteratorOptions.valueEncoding = options.valueEncoding

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
        ((Date.now() - startTime) / 1e3).toFixed(1) + 's,',
        (Math.floor((totalBytes / 1048576) * 100) / 100) + 'MB'
      )

      stream.end()

      db.close(function (err) {
        if (err) throw err

        ldu(db, function (err, size) {
          if (err) throw err
          if (size) console.log('Database size:', bytes.format(size))
        })
      })
    }

    function iterate () {
      if (totalReads >= options.n) return report(Date.now() - startTime)
      if (inProgress >= options.concurrency) return

      inProgress++

      const it = db.iterator(iteratorOptions)

      function loop () {
        if (totalReads >= options.n) return end()
        const start = process.hrtime()

        if (useNextv) {
          it.nextv(nextvSize, function (err, entries) {
            if (err) throw err
            if (entries.length === 0) return end()

            const duration = process.hrtime(start)
            const nano = (duration[0] * 1e9) + duration[1]

            timesAccum += nano
            totalBytes += entries.reduce((acc, e) => acc + Buffer.byteLength(e[0]) + Buffer.byteLength(e[1]), 0)
            totalReads += entries.length

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
        } else {
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
    let bytesWritten = 0

    function loop (err) {
      if (err) throw err

      if (entries % 1e5 === 0 || entries >= options.n) {
        console.log('Prep: wrote %d of %d entries (%s)', entries, options.n, bytes.format(bytesWritten))
      }

      if (entries >= options.n) return compact()

      const batch = db.batch()

      for (let i = 0; i < 1e3 && entries < options.n; i++) {
        const key = writeGenerator.key(entries++)
        const value = writeGenerator.value()

        bytesWritten += Buffer.byteLength(key) + Buffer.byteLength(value)
        batch.put(key, value)
      }

      batch.write(loop)
    }

    function compact () {
      // Flip start & end because writeGenerator is in reverse
      lcompact(db, writeGenerator.key(entries - 1), writeGenerator.key(0), function (err) {
        if (err) throw err

        ldu(db, function (err, size) {
          if (err) throw err
          if (size) console.log('Database size:', bytes.format(size))

          setTimeout(() => start(db), 500)
        })
      })
    }

    loop()
  })
}
