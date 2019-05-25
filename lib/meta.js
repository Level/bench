'use strict'

const path = require('path')
const deepExtend = require('deep-extend')
const deepEqual = require('fast-deep-equal')
const humanNumber = require('human-number')
const bytes = require('bytes')
const byteOptions = require('./byte-options')

const ORDER = ['name', 'version', 'committish', 'arch', 'argv']

class Meta {
  constructor (...sources) {
    const meta = deepExtend({}, ...sources)

    this.name = meta.name || undefined
    this.context = meta.context || {}
    this.platform = meta.platform || {}
    this.executable = meta.executable || {}
    this.harness = meta.harness || {}
    this.options = meta.options || {}
  }

  static create (...sources) {
    return new Meta({
      platform: {
        name: process.platform,
        arch: process.arch // should this be moved to executable?
      },
      executable: {
        name: path.basename(process.execPath, path.extname(process.execPath)),
        version: process.version.replace(/^v/, ''),
        argv: process.execArgv
      }
    }, ...sources)
  }

  profile (peers) {
    return profile(this, peers, false)
  }

  common (peers) {
    return profile(this, peers, true)
  }

  id (peers) {
    return id(this, peers, false)
  }

  group (peers, opts) {
    return id(this, peers, true, opts)
  }
}

module.exports = Meta

function id (meta, peers, invert, opts) {
  const res = profile(meta, peers, invert)
  if (!res) return null

  for (let k of ['context', 'platform', 'executable', 'harness']) {
    if (res[k] && meta[k].name) {
      if (invert && !res[k].name) {
        res[k].committish = null
        res[k].version = null
      } else if (res[k].committish) {
        res[k].name = `${meta[k].name}#${res[k].committish}`
        res[k].committish = null
        res[k].version = null
      } else if (res[k].version) {
        res[k].name = `${meta[k].name}@${res[k].version}`
        res[k].version = null
      } else if (!res[k].name) {
        res[k].name = meta[k].name
      }
    }
  }

  const parts = []
  visit(res, [], opts)

  return parts.filter(Boolean).join(' ') || null

  function visit (node, path, opts) {
    for (let k of sortKeys(Object.keys(node), ORDER)) {
      if (opts && opts.include && opts.include.indexOf(k) < 0) continue
      if (opts && opts.exclude && opts.exclude.indexOf(k) >= 0) continue

      const v = node[k]

      if (v == null) {
        continue
      } else if (Array.isArray(v)) {
        parts.push(...v)
      } else if (typeof v === 'object') {
        visit(v, path.concat(k))
      } else if (path.length > 2) {
        parts.push(`${path.slice(2).join('.')}.${k}=${v}`)
      } else if (typeof v === 'boolean') {
        parts.push(v ? k : `!${k}`)
      } else if (typeof v === 'number') {
        const formatted = byteOptions.has(k) ? bytes.format(v) : humanNumber(v)
        parts.push(`${k}=${formatted}`)
      } else {
        parts.push(v)
      }
    }
  }
}

function profile (obj, peers, invert) {
  if (!peers.length) return
  let acc

  for (let k of sortKeys(Object.keys(obj), ORDER)) {
    if (k[0] === '_') continue

    const v = obj[k]
    const isArray = Array.isArray(v)

    if (v == null) continue
    if (isArray && v.length === 0) continue

    if (!isArray && typeof v === 'object') {
      const res = profile(v, peers.map(p => p && p[k]), invert)
      if (res) (acc = acc || {})[k] = res
    } else {
      let different = invert

      for (let peer of peers) {
        if (peer !== obj && !deepEqual(peer && peer[k], v)) {
          different = !invert
          break
        }
      }

      if (different) {
        (acc = acc || {})[k] = v
      }
    }
  }

  return acc
}

function sortKeys (keys, priority) {
  priority = priority.filter(k => keys.indexOf(k) >= 0)
  keys = keys.filter(k => priority.indexOf(k) < 0)

  return priority.concat(keys)
}
