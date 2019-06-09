#!/usr/bin/env node
'use strict'

const glob = require('fast-glob')
const path = require('path')
const fs = require('fs')
const spawn = require('child_process').spawn
const pkg = require('./package.json')
const run = require('./lib/run')
const Result = require('./lib/result')
const benchmarks = require('./benchmarks')

const argv = require('subarg')(process.argv.slice(2), {
  boolean: ['encode', 'levelup'],
  alias: {
    encode: 'e',
    levelup: 'l',
    benchmark: 'b',
    out: 'o'
  }
})

if (argv.db) argv.db._ = undefined
if (argv.benchmark) argv.benchmark._ = undefined

const command = argv._[0]
const benchmark = argv._[1]

if (!command || !benchmark) {
  console.error('Usage: %s <command> <benchmark>', pkg.name)
  process.exit(1)
}

if (command === 'run') {
  run(benchmark, argv._[2] || '.', argv)
} else if (command === 'plot') {
  const patterns = argv._.slice(2)

  if (!patterns.length) {
    patterns.push(`.benchmarks/${benchmark}.*.csv`)
  }

  const files = glob.sync(patterns)

  if (!files.length) {
    console.error('No files found matching: %s', patterns.join(', '))
    process.exit()
  }

  const type = /^self-/.test(benchmark) ? 'test' : 'benchmark'
  const mainProps = type === 'test' ? ['harness'] : ['context', 'platform']
  const results = files.map(Result.fromFile)
  const group = results[0].group(results, { include: mainProps })
  const title = [`${type} ${benchmark}`, group].filter(Boolean).join(' on ')
  const desc = results[0].group(results, { exclude: ['context', 'platform', 'harness'] }) || ''
  const pngFile = path.resolve('.', argv.out || `.benchmarks/${benchmark}.${Date.now()}.png`)
  const plt = benchmarks[benchmark].plot(title, desc, results)

  // fs.writeFileSync(pngFile + '.plt', plt)
  const cp = spawn('gnuplot', { stdio: ['pipe', 'pipe', 'inherit'] })

  cp.stdout.pipe(fs.createWriteStream(pngFile))
  cp.stdin.end(plt)
} else {
  console.error('Unknown command')
  process.exit(1)
}
