'use strict'

const fs = require('fs')
const path = require('path')
const Meta = require('./meta')

class Result {
  constructor (csvFile, meta) {
    this.csvFile = path.resolve(csvFile)
    this.meta = meta instanceof Meta ? meta : new Meta(meta)
  }

  static fromFile (csvFile) {
    const meta = JSON.parse(fs.readFileSync(csvFile + '.json'))
    return new Result(csvFile, meta)
  }

  id (benches, fallback) {
    return this.meta.name ||
      this.meta.id(benches.map(b => b.meta)) ||
      fallback ||
      'baseline'
  }

  group (benches, opts) {
    return this.meta.group(benches.map(b => b.meta), opts)
  }
}

module.exports = Result
