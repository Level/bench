'use strict'

const e = require('../lib/escape-gnuplot-string')

module.exports = function (title, description, results) {
  const durations = results.map(function (res, i) {
    const file = res.csvFile
    const title = res.id(results)

    return `'${e(file)}' using ($1/1000):($2/1000000) title '${e(title)}' ls ${i + 1} axes x1y1`
  })

  return `
  reset
  set terminal pngcairo truecolor enhanced font "Ubuntu Mono,10" size 1920, 1080 background rgb "#1b1b1b"
  set datafile separator ','

  set autoscale y
  set logscale y

  set xlabel "Time (seconds)" tc rgb "#999999"
  set ylabel "Milliseconds/write" tc rgb "#999999"

  set key outside tc rgb "#999999"
  set border lc rgb "#999999"
  set grid

  # To plot more than 5 files, add more line styles
  set style line 1 lt 7 ps 0.8 lc rgb "#00FFFF"
  set style line 2 lt 7 ps 0.8 lc rgb "#D84797"
  set style line 3 lt 7 ps 0.8 lc rgb "#23CE6B"
  set style line 4 lt 7 ps 0.8 lc rgb "#F5B700"
  set style line 5 lt 7 ps 0.8 lc rgb "#731DD8"

  set title '${e(title)}' tc rgb "#cccccc" offset 0,0.7 font "Ubuntu Mono,12"
  set label 1 '${e(description)}' tc rgb "#999999" at graph 0.5,1.04 center front

  plot ${durations.join(', ')}`
}
