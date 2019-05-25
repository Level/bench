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
  const target = from(cwd, targetId)
  const targetPkg = resolve(targetId + '/package.json', { basedir: cwd })
  const targetDir = path.dirname(targetPkg)
  const { name, version } = require(targetPkg)

  if (typeof target !== 'function') {
    throw new Error('Target must export a function')
  }

  const { run, defaults } = benchmarks[benchmark]
  options = deepExtend({}, defaults, options)

  const context = { name, version, committish: committish(targetDir), ...options.context }
  const { mem, encode, levelup, proto } = options
  const layers = []

  if (proto) {
    Object.setPrototypeOf(target.prototype, from(cwd, proto).prototype)
  }

  for (let k of ['db', 'benchmark']) {
    const opts = options[k] = options[k] || {}

    // Parse e.g. "--cacheSize 8mb"
    for (let k of byteOptions) {
      if (opts[k] != null) opts[k] = bytes.parse(opts[k])
    }
  }

  if (encode) layers.push(from(cwd, 'encoding-down'))
  if (levelup) layers.push(from(cwd, 'levelup'))

  // Default output is the same as the default input of the "plot" command
  const csvFile = path.resolve(cwd, options.out || `.benchmarks/${benchmark}.${Date.now()}.csv`)
  const jsonFile = csvFile + '.json'

  mkdirp.sync(path.dirname(csvFile))

  // Crazy amount of wrapping going on here.
  // If options.location is not set, level-test will create a temporary location
  const factory = ltest(target, Object.assign({}, options.db, { mem, layers }))
  const locationlessFactory = (...args) => factory(options.location, ...args)

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

      db: options.db,
      benchmark: options.benchmark
    }
  })

  fs.writeFileSync(jsonFile, JSON.stringify(meta, null, 2))
  run(locationlessFactory, stream, options.benchmark)
}
