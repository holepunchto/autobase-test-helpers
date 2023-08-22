module.exports = { downloadAll, eventFlush }

function eventFlush () {
  return new Promise(resolve => setImmediate(resolve))
}

async function downloadAll (bases, flush = eventFlush) {
  do {
    await flush()
    await Promise.all(bases.map((b) => downloadAllWriters(b, flush)))
    await flush()
  } while (!synced(bases))
}

function synced (bases) {
  for (let i = 0; i < bases.length; i++) {
    for (const w of bases[i].writers) {
      if (w.core.length !== w.core.contiguousLength) return false
    }
  }
  return true
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
