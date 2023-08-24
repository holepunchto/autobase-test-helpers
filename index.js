module.exports = {
  eventFlush,
  replicate,
  downloadAll,
  downloaded
}

function eventFlush () {
  return new Promise(resolve => setImmediate(resolve))
}

async function downloadAll (bases, flush = eventFlush) {
  do {
    await flush()
    await Promise.all(bases.map((b) => downloadAllWriters(b, flush)))
    await flush()
  } while (!downloaded(bases))
}

function downloaded (bases) {
  for (let i = 0; i < bases.length; i++) {
    for (const w of bases[i].writers) {
      if (w.core.length !== w.core.contiguousLength) return false
    }
  }
  return true
}

function replicate (bases) {
  const streams = []
  const missing = bases.slice()

  while (missing.length) {
    const a = missing.pop()

    for (const b of missing) {
      const s1 = a.store.replicate(true)
      const s2 = b.store.replicate(false)

      s1.on('error', () => {})
      s2.on('error', () => {})

      s1.pipe(s2).pipe(s1)

      streams.push(s1)
      streams.push(s2)
    }
  }

  return close

  function close () {
    return Promise.all(streams.map(s => {
      s.destroy()
      return new Promise(resolve => s.on('close', resolve))
    }))
  }
}

async function downloadAllWriters (base, flush = eventFlush) {
  await base.ready()
  let writers = 0

  do {
    writers = base.writers.length
    for (const w of base.writers) {
      await flush()
      await w.core.update({ wait: true })
      await coreDownloadAll(w.core)
    }
    await base.update()
  } while (writers !== base.writers.length)
}

function coreDownloadAll (core) {
  const start = core.contiguousLength
  const end = core.length
  return core.download({ start, end }).done()
}
