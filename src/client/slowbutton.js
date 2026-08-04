// wiki-plugin-slowbutton — a button that knows how long it takes.
//
// Click -> POST the DSL body to the DSL url. While the action runs the button
// shades itself left-to-right against the estimated duration; past the
// estimate the shading reverses, filling red from the right edge back as the
// overrun grows. When the response is the real result (no `progress` marker)
// it opens as a ghost page and the observed duration joins the learning set,
// so the next estimate is better.
//
// Endpoint contract: a page-json response may carry a top-level
//   progress: { status: "running", elapsed?: seconds, fraction?: 0..1 }
// meaning "not done yet — ask again". `fraction`, when present, drives the
// bar directly (a live feed); otherwise the learned estimate does.

import { parseDSL, estimateSeconds, updateTimes, KEEP_RUNS } from './dsl.js'

const POLL_MS = 5000
const TICK_MS = 250

const FILL = '#7fb3e0'   // progress fill
const BASE = '#e8e8e8'   // unfilled button
const OVER = '#e74c3c'   // overrun, growing right-to-left

const STYLES = `
.slowbutton .sb-btn {
  padding: 6px 14px; border: 1px solid #bbb; border-radius: 4px;
  background: ${BASE}; color: #222; cursor: pointer; font-size: 14px;
}
.slowbutton .sb-btn:disabled { cursor: progress; }
.slowbutton .sb-status { font-size: 12px; color: #888; min-height: 16px; margin-top: 4px; }
`

const canEdit = () => { try { return window.$ && window.$('.editEnable').is(':visible') } catch (e) { return false } }
const persist = (div, item) => {
  try {
    window.wiki.pageHandler.put(div.parents('.page:first'), { type: 'edit', id: item.id, item })
  } catch (e) { /* not signed in — localStorage already has the sample */ }
}

const storeKey = cfg => 'slowbutton:' + cfg.url + ':' + JSON.stringify(cfg.body)
const localTimes = cfg => {
  try { return JSON.parse(localStorage.getItem(storeKey(cfg)) || '[]').filter(n => n > 0) }
  catch (e) { return [] }
}

const resolveUrl = url =>
  url && url.startsWith('//') ? (location.protocol === 'https:' ? 'https:' : 'http:') + url : url

// The shading: one linear-gradient repaint per tick. Within the estimate the
// fill grows left-to-right; in overrun the whole bar is filled and red grows
// right-to-left by overrun/estimate (capped at covering the button).
const shade = (btn, status, elapsed, estimate, fraction) => {
  const est = Math.max(estimate, 1)
  if (elapsed <= est) {
    const p = Math.round(100 * (fraction != null ? Math.min(fraction, 1) : elapsed / est))
    btn.style.background = `linear-gradient(to right, ${FILL} ${p}%, ${BASE} ${p}%)`
    status.textContent = `${Math.round(elapsed)}s / ~${est}s`
  } else {
    const over = Math.min((elapsed - est) / est, 1)
    const edge = Math.round(100 * (1 - over))
    btn.style.background = `linear-gradient(to right, ${FILL} ${edge}%, ${OVER} ${edge}%)`
    status.textContent = `+${Math.round(elapsed - est)}s over the ~${est}s estimate`
  }
}

const postJSON = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const emit = (div, item) => {
  const cfg = parseDSL(item.text || '')
  div.html(`
    <style>${STYLES}</style>
    <div class="slowbutton" data-id="${item.id}">
      <button class="sb-btn">${cfg.label || 'Go'}</button>
      <div class="sb-status"></div>
    </div>`)
}

const bind = (div, item) => {
  div.on('dblclick', event => {
    if (!event.target.closest('button')) window.wiki.textEditor(div, item)
  })
  const btn = div.find('.sb-btn')[0]
  const status = div.find('.sb-status')[0]

  const run = async () => {
    const cfg = parseDSL(item.text || '')
    if (!cfg.url) { status.textContent = 'No POST url — first line should be POST <url>'; return }
    const url = resolveUrl(cfg.url)
    const estimate = estimateSeconds(cfg, localTimes(cfg))
    const t0 = Date.now()
    let fraction = null
    btn.disabled = true

    const timer = setInterval(() => {
      // fedwiki has no plugin dispose hook — self-teardown when detached
      if (!document.contains(btn)) { clearInterval(timer); return }
      shade(btn, status, (Date.now() - t0) / 1000, estimate, fraction)
    }, TICK_MS)
    const cleanup = () => {
      clearInterval(timer)
      btn.style.background = ''
      btn.disabled = false
    }

    try {
      let page
      for (;;) {
        page = await postJSON(url, cfg.body)
        const prog = page && page.progress
        if (prog && prog.status === 'running') {
          fraction = typeof prog.fraction === 'number' ? prog.fraction : null
          await sleep(POLL_MS)
          if (!document.contains(btn)) return
          continue
        }
        break
      }
      const secs = Math.round((Date.now() - t0) / 1000)
      cleanup()
      status.textContent = `done in ${secs}s`
      window.wiki.showResult(window.wiki.newPage(page), { $page: div.parents('.page') })
      // learn: page owners with REMEMBER share the history in the item text;
      // everyone else (and every run regardless) learns locally
      if (cfg.remember && canEdit()) {
        item.text = updateTimes(item.text || '', cfg.times.concat(secs))
        persist(div, item)
        div.empty(); emit(div, item); bind(div, item)
      } else {
        try {
          localStorage.setItem(storeKey(cfg),
            JSON.stringify(localTimes(cfg).concat(secs).slice(-KEEP_RUNS)))
        } catch (e) { /* private mode — learning skipped */ }
      }
    } catch (e) {
      cleanup()
      status.textContent = `Error: ${e.message}`
    }
  }

  btn.addEventListener('click', run)
}

if (typeof window !== 'undefined') {
  window.plugins['slowbutton'] = { emit, bind }
}

export { emit, bind }
