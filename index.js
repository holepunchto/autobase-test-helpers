module.exports = {
  eventFlush,
  replicate,
  sync,
  synced,
  replicateAndSync
}

function eventFlush () {
  return new Promise(resolve => setImmediate(resolve))
}

async function replicateAndSync (bases) {
  const done = replicate(bases)
  await sync(bases)
  done()
}

async function sync (bases) {
  for (const base of bases) {
    await base.update()
  }

  if (bases.length === 1) return

  return new Promise((resolve) => {
    for (const base of bases) base.on('update', check)
    check()

    function check () {
      if (!synced(bases)) return
      for (const base of bases) base.off('update', check)
      resolve()
    }
  })
}

function synced (bases) {
  const first = bases[0]
  for (let i = 1; i < bases.length; i++) {
    if (!same(first, bases[i])) return false
  }
  return true
}

function same (a, b) {
  if (a.updating || b.updating) return false

  const h1 = a.heads()
  const h2 = b.heads()
  if (h1.length !== h2.length) return false
  for (let i = 0; i < h1.length; i++) {
    const h1i = h1[i]
    const h2i = h2[i]
    if (!h1i.key.equals(h2i.key)) return false
    if (h1i.length !== h2i.length) return false
  }
  return true
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
      const s1 = a.replicate(true)
      const s2 = b.replicate(false)

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
