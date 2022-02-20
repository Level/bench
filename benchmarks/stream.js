'use strict'

const keyspace = require('keyspace')
const bytes = require('bytes')
const ldu = require('../lib/level-du')
const lcompact = require('../lib/level-compact')
const { EntryStream: NodeStream } = require('level-read-stream')
const { EntryStream: WebStream } = require('level-web-stream')
const window = 1000
const progressWindow = window * 100

exports.defaults = {
  benchmark: {
    n: 2e6,
    concurrency: 1,
    valueSize: 100,
    values: 'random',
    seed: 'seed',
    web: false
  }
}

exports.plot = require('./iterate.plot')

exports.run = function (factory, stream, options) {
  if (options.n < window) {
    throw new RangeError('The "n" option must be >= ' + window)
  } else if (options.n % window !== 0) {
    throw new Error('The "n" option must be a multiple of ' + window)
  }

  const webStreams = !!options.web
  const writeGenerator = keyspace(options.n, Object.assign({}, options, {
    // Writing ordered data in reverse is the fastest (at least in LevelDB)
    keys: 'seqReverse'
  }))

  stream.write('Elapsed (ms), Entries, Bytes, ns/read, CMA MB/s\n')

  function start (db) {
    const startTime = Date.now()
    const builtin = !webStreams && typeof db.createReadStream === 'function'

    let inProgress = 0
    let totalReads = 0
    let totalBytes = 0
    let timesAccum = 0
    let elapsed

    function report () {
      console.log(
        'Streamed', options.n, 'entries in',
        ((Date.now() - startTime) / 1e3).toFixed(3) + 's,',
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

    // const IteratorStream = require('level-iterator-stream')
    // function createReadStream (db, options) {
    //   options = Object.assign({ keys: true, values: true }, options)
    //   if (typeof options.limit !== 'number') { options.limit = -1 }
    //   return new IteratorStream(db.iterator({ ...options, highWaterMark: 1024 * 1024 }), { ...options, highWaterMark: 1000 })
    // }

    function work () {
      if (totalReads >= options.n) return report(Date.now() - startTime)
      if (inProgress >= options.concurrency) return

      const rs = webStreams ? new WebStream(db) : builtin ? db.createReadStream() : new NodeStream(db)

      inProgress++
      let start = process.hrtime()

      if (webStreams) {
        // This is slower. I'd expect it to be faster because ondata is sync
        // const { WritableStream, CountQueuingStrategy } = require('stream/web')
        // const strategy = new CountQueuingStrategy({ highWaterMark: 1e3 })
        // const ws = new WritableStream({ write: ondata }, strategy)
        // rs.pipeTo(ws).then(onclose)

        ;(async () => {
          for await (const x of rs) {
            ondata(x)
          }
        })().then(onclose)
      } else {
        rs.on('data', ondata)
        rs.once('close', onclose)
      }

      function onclose () {
        inProgress--
        process.nextTick(work)
      }

      function ondata (entry) {
        const duration = process.hrtime(start)
        const nano = (duration[0] * 1e9) + duration[1]
        const byteLength = webStreams
          ? Buffer.byteLength(entry[0]) + Buffer.byteLength(entry[1])
          : Buffer.byteLength(entry.key) + Buffer.byteLength(entry.value)

        timesAccum += nano
        totalBytes += byteLength
        totalReads++

        start = process.hrtime()

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
      }
    }

    for (let i = 0; i < options.concurrency; i++) work()
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

      if (entries >= options.n) return setTimeout(compact, 500)

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
