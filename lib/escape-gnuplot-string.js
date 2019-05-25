'use strict'

// Escape special characters for gnuplot
// Note: must *also* use single quotes.
module.exports = function escape (str) {
  return str.replace(/[@{}^_'"\\]/g, (s) => `\\${s}`)
}
