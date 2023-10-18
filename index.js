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

  return new Promise((resolve) => {
    for (const base of bases) base.on('update', check)
    check()

    async function check () {
      if (!synced(bases)) return
      for (const base of bases) {
        await base.update()
      }
      if (!synced(bases)) return
      for (const base of bases) base.off('update', check)
      resolve()
    }
  })
}

function synced (bases) {
  const first = bases[0]
  for (let i = 1; i < bases.length; i++) {
    if (!same(first, bases[i])) {
      compareStreamState(first, bases[i], bases)
      return false
    }
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

    if (!b4a.equals(h1i.key, h2i.key)) return false
    if (h1i.length !== h2i.length) return false
  }

  return true
}

function compareStreamState (a, b, bases) {
  // match corresponding writers on each side
  const cores = [...a.activeWriters.map].reduce((acc, [k, v]) => {
    const r = b.activeWriters.map.get(k)
    if (r) acc.push(v.core.length < r.core.length ? [v.core, r.core] : [r.core, v.core])
    return acc
  }, [])

  for (const [behind, ahead] of cores) {
    const request = behind.replicator._inflight._requests.slice().pop()

    if (!request) {
      // probably means the writer core didn't wake up
      continue
    }

    const localPeer = request.peer

    let remote
    for (const base of bases) {
      for (const { stream } of base.local.replicator._attached) {
        if (b4a.equals(stream.publicKey, localPeer.stream.remotePublicKey)) {
          remote = base.local.replicator
        }
        break
      }
      if (remote) break
    }

    if (!remote) {
      // probably means the writer core didn't wake up
      continue
    }

    let remotePeer = null
    for (remotePeer of remote.peers) {
      if (b4a.equals(remotePeer.remotePublicKey, localPeer.stream.publicKey)) break
      remotePeer = null
    }

    if (!remotePeer) {
      continue
    }

    const localChannel = localPeer.channel
    const remoteChannel = remotePeer.channel

    /* stream state differs on either side */
  }
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
