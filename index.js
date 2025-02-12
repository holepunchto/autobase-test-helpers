const b4a = require('b4a')

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
  await done()
}

async function sync (bases) {
  for (const base of bases) {
    await base.update()
  }

  if (bases.length === 1) return

  return new Promise((resolve, reject) => {
    let done = false
    let checks = 0

    for (const base of bases) {
      base.on('update', check)
      base.on('error', shutdown)
    }

    check()

    async function check () {
      checks++
      if (!(await same())) return mbShutdown()
      for (const base of bases) {
        await base.update()
      }
      if (!(await same())) return mbShutdown()
      shutdown()
    }

    function mbShutdown () {
      if (done) return shutdown()
      checks--
    }

    async function same () {
      return synced(bases) && await sameHash(bases)
    }

    function shutdown (err) {
      checks--
      done = true
      if (checks !== 0 && !err) return

      for (const base of bases) {
        base.off('update', check)
        base.off('error', shutdown)
      }

      if (err) reject(err)
      else resolve()
    }
  })
}

async function sameHash (bases) {
  const first = bases[0]
  const h1 = await first.hash()
  for (let i = 1; i < bases.length; i++) {
    const h2 = await bases[i].hash()
    if (!b4a.equals(h1, h2)) return false
  }
  return true
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
  if (a.signedLength !== b.signedLength) return false

  const h1 = a.heads()
  const h2 = b.heads()

  if (h1.length !== h2.length) return false

  for (let i = 0; i < h1.length; i++) {
    const h1i = h1[i]
    const h2i = h2[i]

    if (!b4a.equals(h1i.key, h2i.key)) return false
    if (h1i.length !== h2i.length) return false
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

      s1.on('error', (err) => {
        if (err.code) console.log('autobase replicate error:', err.stack)
      })
      s2.on('error', (err) => {
        if (err.code) console.log('autobase replicate error:', err.stack)
      })

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
