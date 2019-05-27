'use strict'

// Note: redis-server must be available in PATH
const tmpRedis = require('tmp-redis')

module.exports = function inject (Redis) {
  return function (location, options, callback) {
    let redis
    let shutdown

    // Expire keys (which is cheap) to avoid blowing up memory
    const ttlSeconds = options.ttl || 10
    const port = options.port || 6389

    // "For better performance. Recommended to be enabled when handling large
    // array response and you don't need the buffer support."
    const dropBufferSupport = !!options.dropBufferSupport

    const wrapper = {
      status: 'new',

      open: function (options, callback) {
        wrapper.status = 'opening'

        tmpRedis(port, function (err, shutdown_) {
          if (err) return callback(err)

          shutdown = shutdown_
          redis = new Redis({
            port,
            retryStrategy: () => false,
            maxRetriesPerRequest: 0,
            autoResubscribe: false,
            autoResendUnfulfilledCommands: false,
            enableOfflineQueue: false,
            dropBufferSupport
          })

          redis.once('ready', function () {
            wrapper.status = 'open'
            callback(null, wrapper)
          })

          // ioredis swallows errors if there's no listener
          redis.on('error', function (err) {
            throw err
          })
        })
      },

      put: function (key, value/*, options */, callback) {
        redis.set(key, value, 'EX', ttlSeconds, callback)
      },

      close: function (callback) {
        redis.disconnect()
        shutdown(callback)
      },

      // Trick reachdown
      _iterator: function () {}
    }

    return wrapper
  }
}
