'use strict'

const test = require('tape')
const Meta = require('../lib/meta')

test('meta', function (t) {
  const a = new Meta({ context: { name: 'leveldown' } })
  const b = new Meta({ context: { name: 'rocksdb' } })

  t.same([a, b].map((p, i, arr) => [p.id(arr), p.group(arr)]), [
    ['leveldown', null],
    ['rocksdb', null]
  ])

  a.context.version = '1.0.0'

  t.same([a, b].map((p, i, arr) => [p.id(arr), p.group(arr)]), [
    ['leveldown@1.0.0', null],
    ['rocksdb', null]
  ])

  a.executable.name = 'node'
  b.executable.name = 'node'

  t.same([a, b].map((p, i, arr) => [p.id(arr), p.group(arr)]), [
    ['leveldown@1.0.0', 'node'],
    ['rocksdb', 'node']
  ])

  b.executable.version = '10.14.1'

  t.same([a, b].map((p, i, arr) => [p.id(arr), p.group(arr)]), [
    ['leveldown@1.0.0', 'node'],
    ['rocksdb node@10.14.1', 'node']
  ])

  a.executable.version = '10.14.1'

  t.same([a, b].map((p, i, arr) => [p.id(arr), p.group(arr)]), [
    ['leveldown@1.0.0', 'node@10.14.1'],
    ['rocksdb', 'node@10.14.1']
  ])

  t.end()
})
