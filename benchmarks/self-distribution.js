'use strict'

const keyspace = require('keyspace')

exports.defaults = {
  benchmark: {
    n: 5e3
  }
}

exports.plot = require('./self-distribution.plot')

exports.run = function (factory, stream, options) {
  stream.write('Step, Key, Frequency\n')

  const generator = keyspace(options.n, Object.assign({}, options, {
    keyAsNumber: true
  }))

  let step = 0

  const frequencies = new Array(options.n).fill(0)
  const keys = new Array(options.n).fill(0)

  while (step < options.n) {
    const key = generator.key(step)

    frequencies[key]++
    keys[step++] = key

    if (step % 1000 === 0) {
      console.log('%d %d%', step, Math.round(step / options.n * 100))
    }
  }

  step = 0
  write()

  function write () {
    if (step < options.n) {
      const key = keys[step]
      const frequency = frequencies[step]

      stream.write(`${step++}, ${key}, ${frequency}\n`, write)
    } else {
      stream.end()
    }
  }
}
