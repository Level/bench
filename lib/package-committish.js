'use strict'

const fs = require('fs')
const path = require('path')
const execSync = require('child_process').execSync
const commit = require('current-commit').sync
const BRANCH_RE = /^ref: refs\/heads\/(.+)\n/

module.exports = function (dir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json')))

  // If npm-installed
  if (pkg._requested) {
    // Can be a branch (which we shouldn't slice) or a commit
    // return short(pkg._requested.gitCommittish)

    return pkg._requested.gitCommittish || undefined
  }

  try {
    const gitDir = path.join(dir, '.git')
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8')
    const match = head.match(BRANCH_RE)

    // Prefer recognizable branch names over commits
    if (match && match[1] !== 'master') return match[1]
  } catch (err) {
    return
  }

  if (tryExec('git describe --tag --exact-match', dir)) {
    // Tagged and no commits since. Package version will suffice.
    return
  }

  return short(commit(dir))
}

function short (commit) {
  return commit ? commit.slice(0, 7) : undefined
}

function tryExec (command, cwd) {
  try {
    execSync(command, { cwd, stdio: 'ignore' })
  } catch (err) {
    return false
  }

  return true
}
