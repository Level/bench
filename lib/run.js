'use strict'

const deepExtend = require('deep-extend')
const ltest = require('level-test')
const resolve = require('resolve').sync
const bytes = require('bytes')
const mkdirp = require('mkdirp')
const tempy = require('tempy')
const fs = require('fs')
const path = require('path')
const Meta = require('./meta')
const byteOptions = require('./byte-options')
const committish = require('./package-committish')
const benchmarks = require('../benchmarks')
const pkg = require('../package.json')
const harness = { name: pkg.name, version: pkg.version }
const from = (basedir, id) => require(resolve(id, { basedir }))

module.exports = function (benchmark, targetId, options) {
  if (!benchmarks[benchmark]) {
    throw new Error(`Unknown benchmark: ${benchmark}`)
  }

  // Load target module from working directory
  const cwd = process.cwd()
  const targetPkg = resolve(targetId + '/package.json', { basedir: cwd })
  const targetDir = path.dirname(targetPkg)
  const { name, version } = require(targetPkg)

  let target = from(cwd, targetId)

  if (targetId === 'sqlite3' || name === 'sqlite3') {
    target = require('../third-party/sqlite3')(target)
  } else if (targetId === 'ioredis' || name === 'ioredis') {
    target = require('../third-party/ioredis')(target)
  }

  const { run, defaults } = benchmarks[benchmark]
  options = deepExtend({}, defaults, options)

  const context = { name, version, committish: committish(targetDir), ...options.context }
  const { mem, sublevel, class: className } = options
  const layers = []

  if (className) {
    // Use a named export
    target = target[className]
  } else if (typeof target === 'object' && target !== null) {
    // Find named export if there's just one
    const keys = Object.keys(target)
    if (keys.length === 1) target = target[keys[0]]
  }

  if (typeof target !== 'function') {
    throw new TypeError('Target must export a function or an object containing one')
  }

  // TODO: update level-compose to use `new`
  const Ctor = target
  target = (...args) => new Ctor(...args)

  for (const k of ['db', 'benchmark']) {
    const opts = options[k] = options[k] || {}

    // Parse e.g. "--cacheSize 8mb" and "--iterator [ --highWaterMarkBytes 1mb ]"
    const visit = function (opts) {
      for (const k in opts) {
        if (opts[k] == null) continue
        if (typeof opts[k] === 'object') visit(opts[k])
        if (byteOptions.has(k)) opts[k] = bytes.parse(opts[k])
      }
    }

    visit(opts)
  }

  if (sublevel) {
    const name = typeof sublevel === 'string' ? sublevel : 'benchmark'

    // TODO: can't pass --db options to the parent database
    layers.push((db, options) => db.sublevel(name, options))
  }

  // Default output is the same as the default input of the "plot" command
  const csvFile = path.resolve(cwd, options.out || `.benchmarks/${benchmark}.${Date.now()}.csv`)
  const jsonFile = csvFile + '.json'

  mkdirp.sync(path.dirname(csvFile))

  const addHooksAndEvents = (db) => {
    // Test the cost of adding X amount of hook functions
    // E.g. level-bench run batch-put ../memory-level --hooks [ --prewrite=1 ]
    // TODO: docs
    if (options.hooks) {
      for (const name of ['prewrite']) {
        const count = parseInt(options.hooks[name] || 0, 10)

        if (!Number.isInteger(count) || count < 0) {
          throw new RangeError(`The "hooks.${name}" option must be >= 0`)
        }

        if (count > 0 && (!db.hooks || !db.hooks[name])) {
          throw new Error(`Database does not support ${name} hook`)
        }

        for (let i = 0; i < count; i++) {
          db.hooks[name].add(function () {})
        }
      }
    }

    // Test the cost of adding X amount of event listeners
    // E.g. level-bench run batch-put ../memory-level --events [ --write=1 ]
    // TODO: docs
    if (options.events) {
      for (const name of ['write', 'batch', 'put', 'del']) {
        const count = parseInt(options.events[name] || 0, 10)

        if (!Number.isInteger(count) || count < 0) {
          throw new RangeError(`The "events.${name}" option must be >= 0`)
        }

        if (count > 0 && (!db.supports.events || !db.supports.events[name])) {
          throw new Error(`Database does not support ${name} event`)
        }

        for (let i = 0; i < count; i++) {
          db.on(name, function () {})
        }
      }
    }
  }

  let factory

  if (name === 'rave-level') {
    // TODO: make role (leader or follower) configurable
    const loc = options.location || tempy.directory()

    factory = (cb) => {
      // Prevent GC
      const leader = global.__raveLeader = target(loc)

      leader.open(function (err) {
        if (err) throw err

        leader.getMany(['x'], function (err) {
          if (err) throw err
          const follower = target(loc)
          addHooksAndEvents(follower)
          follower.open((err) => cb(err, follower))
        })
      })
    }
  } else {
    // If options.location is not set, level-test will create a temporary location
    const dbFactory = ltest(target, Object.assign({}, options.db, { mem, layers }))

    factory = (cb) => {
      const db = dbFactory(options.location)
      addHooksAndEvents(db)
      db.open((err) => cb(err, db))
    }
  }

  // TODO: use sonic-boom in sync mode, to not affect benchmark
  const stream = fs.createWriteStream(csvFile, 'utf8')
  console.error('Writing results to %s', csvFile)

  const meta = Meta.create({
    name: options.name,
    context,
    harness,
    options: {
      // Hack to exclude certain properties from plot labels
      sublevel: options.sublevel ? true : undefined,
      class: undefined,

      db: options.db,
      benchmark: options.benchmark,
      hooks: options.hooks || undefined,
      events: options.events || undefined
    }
  })

  fs.writeFileSync(jsonFile, JSON.stringify(meta, null, 2))
  run(factory, stream, options.benchmark)
}
