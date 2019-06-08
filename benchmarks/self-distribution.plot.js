'use strict'

const e = require('../lib/escape-gnuplot-string')

module.exports = function (title, description, results) {
  const minHeight = 800
  const height = minHeight + results.length * 300
  const subtitleY = 1 - (80 / height)
  const mainPlotRatio = minHeight / height
  const freqPlotsRatio = 1 - mainPlotRatio
  const freqPlotsbHeight = freqPlotsRatio / results.length

  const keys = results.map(function (res, i) {
    const file = res.csvFile
    const title = results.length === 1 ? '' : res.id(results, 'default')

    return `'${e(file)}' using ($1):($2) title '${e(title)}' ls ${i + 1} axes x1y1`
  })

  const frequencies = results.map(function (res, i) {
    // Sequential keys all have a frequency of 1 which gnuplot can't handle
    if (/seq/.test(res.meta.options.benchmark.keys)) return

    const file = res.csvFile
    const title = results.length === 1 ? '' : res.id(results, 'default')

    return [
      `set size 1,${freqPlotsbHeight.toFixed(3)}`,
      `set origin 0.0,${((results.length - i - 1) * freqPlotsbHeight).toFixed(3)}`,
      `plot '${e(file)}' using 1:3 with boxes title '' ls ${i + 1} axes x1y1`
    ].join('\n    ')
  }).filter(Boolean)

  return `
  reset
  set terminal pngcairo truecolor enhanced font "Ubuntu Mono,10" size 1920,${height} background rgb "#1b1b1b"
  set datafile separator ','

  set autoscale y
  set ytics mirror
  set tics in
  set xlabel "Step" tc rgb "#999999"

  set key outside tc rgb "#999999"
  set border lc rgb "#999999"

  # To plot more than 5 files, add more line styles
  set style line 1 lt 7 ps 0.8 lc rgb "#00FFFF"
  set style line 2 lt 7 ps 0.8 lc rgb "#D84797"
  set style line 3 lt 7 ps 0.8 lc rgb "#23CE6B"
  set style line 4 lt 7 ps 0.8 lc rgb "#F5B700"
  set style line 5 lt 7 ps 0.8 lc rgb "#731DD8"

  set multiplot
    set lmargin at screen 0.1

    set size 1,${mainPlotRatio.toFixed(3)}
    set origin 0,${freqPlotsRatio.toFixed(3)}
    set title '${e(title)}' tc rgb "#cccccc" offset 0,0.7 font "Ubuntu Mono,12"
    set label 1 '${e(description)}' tc rgb "#999999" at screen 0.5,${subtitleY.toFixed(3)} center front
    set ylabel 'Key' tc rgb "#999999"
    set nologscale y
    plot ${keys.join(', ')}

    set title ''
    set label 1 ''
    set rmargin at screen 0.97
    set ylabel 'Frequency' tc rgb "#999999"
    set xlabel 'Key' tc rgb "#999999"
    set logscale y
    set xrange [0:*]
    set style fill solid

    ${frequencies.join('\n\n    ')}
  unset multiplot`
}
