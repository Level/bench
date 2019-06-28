'use strict'

const e = require('../lib/escape-gnuplot-string')

// Note: also used by batch-put.js
module.exports = function (title, description, results) {
  const durations = results.map(function (res, i) {
    const file = res.csvFile
    const title = res.id(results)

    return `'${e(file)}' using ($1/1000):($4) title '${e(title)}' ls ${i + 1} axes x1y1`
  })

  const throughputs = results.map(function (res, i) {
    const file = res.csvFile
    const title = res.id(results)

    return `'${e(file)}' using ($1/1000):($5) w lines title '${e(title)}' ls ${i + 1} axes x1y1`
  })

  return `
  reset
  set terminal pngcairo truecolor enhanced font "Ubuntu Mono,10" size 1920, 1080 background rgb "#1b1b1b"
  set datafile separator ','

  set autoscale y
  set ytics mirror
  set tics in
  set xlabel "Time (seconds)" tc rgb "#999999"

  set key outside tc rgb "#999999"
  set border lc rgb "#999999"

  # To plot more than 5 files, add more line styles
  set style line 1 lt 7 ps 0.8 lc rgb "#00FFFF"
  set style line 2 lt 7 ps 0.8 lc rgb "#D84797"
  set style line 3 lt 7 ps 0.8 lc rgb "#23CE6B"
  set style line 4 lt 7 ps 0.8 lc rgb "#F5B700"
  set style line 5 lt 7 ps 0.8 lc rgb "#731DD8"

  set multiplot layout 2,1
    set lmargin at screen 0.1

    set title '${e(title)}' tc rgb "#cccccc" offset 0,0.7 font "Ubuntu Mono,12"
    set label 1 '${e(description)}' tc rgb "#999999" at graph 0.5,1.10 center front
    set ylabel 'SMA Milliseconds/write' tc rgb "#999999"
    set logscale y
    plot ${durations.join(', ')}

    set title ""
    set label 1 ""
    set ylabel 'CMA Throughput MB/s' tc rgb "#999999"
    set nologscale y
    plot ${throughputs.join(', ')}
  unset multiplot`
}
