// wiki-plugin-slowbutton — line-oriented DSL for a button that learns how
// long its action takes. UPPERCASE first word = command (Ward's convention),
// lowercase `key: value` lines = the JSON body the button POSTs.
//
//   POST //api.example.com/slow/action
//   LABEL Do the slow thing
//   TIME 4m
//   REMEMBER
//   TIMES 178 305 244
//   query: what to act on
//
// TIME seeds the estimate (plain seconds, or 90s / 4m). TIMES is written by
// the plugin itself — the last runs it observed — and users may edit or
// clear it. REMEMBER opts into writing TIMES back into the item text (page
// owners only); without it the learning still happens, in localStorage.

// Match a keyword at the start of a line, requiring end, whitespace or colon
// after it — so a data line like "timezone: UTC" never matches TIME.
const isCmd = (upper, kw) => upper === kw || (upper.startsWith(kw) && /^[\s:]/.test(upper.slice(kw.length)))
const val = (line, kw) => line.slice(kw.length).replace(/^\s*:?\s*/, '').trim()

// "240" | "240s" | "90 sec" | "4m" | "4 min" -> seconds (null when unparsable)
const parseTimeSpec = spec => {
  const m = /^(\d+(?:\.\d+)?)\s*(min|m|sec|s)?$/i.exec((spec || '').trim())
  if (!m) return null
  const n = parseFloat(m[1])
  return /^m/i.test(m[2] || '') ? Math.round(n * 60) : Math.round(n)
}

const parseDSL = text => {
  let url = null
  let label = null
  let time = null        // seed estimate, seconds
  let remember = false
  let times = []         // observed durations, seconds, oldest first
  const body = {}

  for (const raw of (text || '').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const upper = line.toUpperCase()
    if (isCmd(upper, 'POST') || isCmd(upper, 'URL')) {
      url = val(line, upper.startsWith('POST') ? 'POST' : 'URL')
      continue
    }
    if (isCmd(upper, 'LABEL')) { label = val(line, 'LABEL'); continue }
    if (isCmd(upper, 'TIMES')) {
      times = val(line, 'TIMES').split(/[\s,]+/).map(Number).filter(n => n > 0)
      continue
    }
    if (isCmd(upper, 'TIME')) { time = parseTimeSpec(val(line, 'TIME')); continue }
    if (isCmd(upper, 'REMEMBER')) { remember = true; continue }
    // lowercase data line: key: value -> POST body
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    if (kv && kv[1] === kv[1].toLowerCase()) body[kv[1]] = kv[2].trim()
  }

  return { url, label, time, remember, times, body }
}

const KEEP_RUNS = 8

// Estimate in seconds: mean of everything observed (item TIMES + any extra
// samples, e.g. localStorage), else the TIME seed, else a minute.
const estimateSeconds = (cfg, extraTimes = []) => {
  const all = (cfg.times || []).concat(extraTimes).filter(n => n > 0)
  if (all.length) return Math.round(all.reduce((a, b) => a + b, 0) / all.length)
  return cfg.time || 60
}

// Surgically replace (or insert) the TIMES line, preserving every other line
// verbatim — comments, unknown commands, body lines, ordering.
const updateTimes = (text, times) => {
  const stamp = 'TIMES ' + times.slice(-KEEP_RUNS).map(n => Math.round(n)).join(' ')
  const lines = (text || '').split('\n')
  const isTimesLine = l => {
    const u = l.trim().toUpperCase()
    return isCmd(u, 'TIMES')
  }
  const at = lines.findIndex(isTimesLine)
  if (at >= 0) { lines[at] = stamp; return lines.join('\n') }
  const anchor = lines.findIndex(l => {
    const u = l.trim().toUpperCase()
    return isCmd(u, 'REMEMBER') || isCmd(u, 'TIME')
  })
  if (anchor >= 0) { lines.splice(anchor + 1, 0, stamp); return lines.join('\n') }
  return (text ? text.replace(/\n?$/, '\n') : '') + stamp
}

export { parseDSL, parseTimeSpec, estimateSeconds, updateTimes, KEEP_RUNS }
