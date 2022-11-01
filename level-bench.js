#!/usr/bin/env node
'use strict'

const glob = require('fast-glob')
const percent = require('fixed-number')(1, 2, 'percent')
const path = require('path')
const fs = require('fs')
const spawn = require('child_process').spawn
const pkg = require('./package.json')
const run = require('./lib/run')
const Result = require('./lib/result')
const benchmarks = require('./benchmarks')

// https://github.com/substack/subarg/issues/7
if (/\[\[|\]\]/.test(process.argv.slice(2).join(' '))) {
  console.error('Subarg brackets must be surrounded by spaces')
}

const argv = require('subarg')(process.argv.slice(2), {
  boolean: [],
  alias: {
    benchmark: 'b',
    class: 'c',
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
  const withStats = results.filter(r => !!r.meta.stats)
  const kMean = Symbol('mean')

  // If the benchmark supports stats, print them
  if (withStats.length > 0) {
    console.error(title + '\n' + desc + '\n')

    for (const result of withStats) {
      // Lower is better (fastest and with highest confidence)
      result[kMean] = result.meta.stats.op.mean + result.meta.stats.op.moe
    }

    // Sort winner first
    withStats.sort(function (a, b) {
      return a[kMean] === b[kMean] ? 0 : a[kMean] > b[kMean] ? 1 : -1
    })

    // Format the benchmark ids
    const ids = withStats.map(result => result.id(results).split(' '))
    const alignedIds = alignRows(ids, { align: 'left' })

    // Build table
    const rows = alignRows(withStats.map((result, i) => {
      const rank = String(i + 1)
      const summary = `${Math.round(result.meta.stats.hertz)} ops/s ±${percent(result.meta.stats.rme)}`
      const delta = i === 0 ? 'fastest' : ('+' + percent(1 - (withStats[0][kMean] / result[kMean])))

      return [rank, ...alignedIds[i], summary, delta]
    }))

    console.error(rows.map(cells => cells.join('  ')).join('\n'))
  }

  // fs.writeFileSync(pngFile + '.plt', plt)
  const cp = spawn('gnuplot', { stdio: ['pipe', 'pipe', 'inherit'] })

  cp.stdout.pipe(fs.createWriteStream(pngFile))
  cp.stdin.end(plt)
} else {
  console.error('Unknown command')
  process.exit(1)
}

function alignRows (rows, opts) {
  const widths = []
  const rowAlignment = opts && opts.align

  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i] || 0, row[i].length)
    }
  }

  return rows.map(function (row) {
    return widths.map(function (width, i) {
      const cell = row[i] || ''
      const alignment = rowAlignment || (i === 0 ? 'left' : 'right')
      const pad = alignment === 'left' ? 'padEnd' : 'padStart'

      return cell[pad](width)
    })
  })
}
