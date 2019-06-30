'use strict'

const deepExtend = require('deep-extend')
const ltest = require('level-test')
const resolve = require('resolve').sync
const bytes = require('bytes')
const mkdirp = require('mkdirp')
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
  const { name, version, dependencies } = require(targetPkg)
  const hasDep = (dep) => dependencies && dependencies[dep]

  let target = from(cwd, targetId)

  if (targetId === 'sqlite3' || name === 'sqlite3') {
    target = require('../third-party/sqlite3')(target)
  } else if (targetId === 'ioredis' || name === 'ioredis') {
    target = require('../third-party/ioredis')(target)
  }

  const { run, defaults } = benchmarks[benchmark]
  options = deepExtend({}, defaults, options)

  const context = { name, version, committish: committish(targetDir), ...options.context }
  const { mem, encode, levelup, sublevel, proto, class: className } = options
  const layers = []

  // Implies an abstract-level database with a named export
  if (className) {
    target = target[className]
  } else if (hasDep('abstract-level')) {
    throw new Error('The --class option is required for abstract-level')
  }

  if (typeof target !== 'function') {
    throw new Error('Target must export a function')
  }

  if (proto) {
    Object.setPrototypeOf(target.prototype, from(cwd, proto).prototype)
  }

  // TODO: update level-compose to use `new`
  if (className) {
    const Ctor = target
    target = (...args) => new Ctor(...args)
  }

  for (const k of ['db', 'benchmark']) {
    const opts = options[k] = options[k] || {}

    // Parse e.g. "--cacheSize 8mb" and "--iterator [ --highWaterMark 1mb ]"
    const visit = function (opts) {
      for (const k in opts) {
        if (opts[k] == null) continue
        if (typeof opts[k] === 'object') visit(opts[k])
        if (byteOptions.has(k)) opts[k] = bytes.parse(opts[k])
      }
    }

    visit(opts)
  }

  if (encode) layers.push(from(cwd, 'encoding-down'))
  if (levelup) layers.push(from(cwd, 'levelup'))

  if (sublevel) {
    const subdb = className ? null : from(cwd, 'subleveldown')
    const prefix = typeof sublevel === 'string' ? sublevel : 'benchmark'

    // TODO: can't pass --db options to the parent database
    layers.push((db, options) => className ? db.sublevel(prefix, options) : subdb(db, prefix, options))
  }

  // Default output is the same as the default input of the "plot" command
  const csvFile = path.resolve(cwd, options.out || `.benchmarks/${benchmark}.${Date.now()}.csv`)
  const jsonFile = csvFile + '.json'

  mkdirp.sync(path.dirname(csvFile))

  // Crazy amount of wrapping going on here.
  // If options.location is not set, level-test will create a temporary location
  const factory = ltest(target, Object.assign({}, options.db, { mem, layers }))
  let simpleFactory

  if (className || name === 'level-mem') {
    // abstract-level does not support factory callback
    simpleFactory = (cb) => {
      const db = factory(options.location)
      db.open((err) => cb(err, db))
    }
  } else {
    simpleFactory = (cb) => factory(options.location, cb)
  }

  // TODO: use sonic-boom in sync mode, to not affect benchmark
  const stream = fs.createWriteStream(csvFile, 'utf8')
  console.error('Writing results to %s', csvFile)

  const meta = Meta.create({
    name: options.name,
    context,
    harness,
    options: {
      // Hack to exclude e.g. encode=false from plot labels
      encode: options.encode || undefined,
      levelup: options.levelup || undefined,
      sublevel: options.sublevel ? true : undefined,
      class: undefined,

      db: options.db,
      benchmark: options.benchmark
    }
  })

  fs.writeFileSync(jsonFile, JSON.stringify(meta, null, 2))
  run(simpleFactory, stream, options.benchmark)
}
