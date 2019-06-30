# Third party

This directory contains thin wrappers (that intentionally _don't_ implement the full `abstract-leveldown` interface) around third-party databases and libraries like [`ioredis`](https://github.com/luin/ioredis) and [`sqlite3`](https://github.com/mapbox/node-sqlite3), to be able to run `level-bench` on them for comparison.

## Supported benchmarks (so far)

The `put` benchmark on `ioredis` (`redis-server` must be available in `PATH`):

```
npm i ioredis leveldown
level-bench run put ioredis
level-bench run put leveldown
level-bench plot put
```

![write.ioredis-vs-leveldown](img/write.ioredis-vs-leveldown.png)

The `put` benchmark on `sqlite3` (100-1000x slower than `leveldown`, lower the amount of operations with `-n`):

```
npm i sqlite3 leveldown
level-bench run put sqlite3 -b [-n 2e4]
level-bench run put leveldown -b [-n 2e4]
level-bench plot put
```

![write.sqlite3-vs-leveldown](img/write.sqlite3-vs-leveldown.png)
