import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDSL, parseTimeSpec, estimateSeconds, updateTimes } from '../src/client/dsl.js'

const SAMPLE = `POST //api.localhost/buy/search
LABEL Buy Pi Zero 2
TIME 4m
REMEMBER
TIMES 178 305
query: Raspberry Pi Zero 2 W
region: uk`

test('parses commands and body', () => {
  const cfg = parseDSL(SAMPLE)
  assert.equal(cfg.url, '//api.localhost/buy/search')
  assert.equal(cfg.label, 'Buy Pi Zero 2')
  assert.equal(cfg.time, 240)
  assert.equal(cfg.remember, true)
  assert.deepEqual(cfg.times, [178, 305])
  assert.deepEqual(cfg.body, { query: 'Raspberry Pi Zero 2 W', region: 'uk' })
})

test('time specs', () => {
  assert.equal(parseTimeSpec('240'), 240)
  assert.equal(parseTimeSpec('90s'), 90)
  assert.equal(parseTimeSpec('4m'), 240)
  assert.equal(parseTimeSpec('4 min'), 240)
  assert.equal(parseTimeSpec('soon'), null)
})

test('a body line starting with time does not match TIME', () => {
  const cfg = parseDSL('POST //x/y\ntimezone: UTC')
  assert.equal(cfg.time, null)
  assert.equal(cfg.body.timezone, 'UTC')
})

test('estimate: mean of observed beats seed, seed beats default', () => {
  assert.equal(estimateSeconds(parseDSL(SAMPLE), []), Math.round((178 + 305) / 2))
  assert.equal(estimateSeconds(parseDSL('POST //x\nTIME 30'), []), 30)
  assert.equal(estimateSeconds(parseDSL('POST //x'), []), 60)
  assert.equal(estimateSeconds(parseDSL('POST //x'), [10, 20]), 15)
})

test('updateTimes replaces in place, preserving all other lines', () => {
  const out = updateTimes(SAMPLE, [178, 305, 244])
  assert.match(out, /TIMES 178 305 244/)
  assert.equal(out.split('\n').length, SAMPLE.split('\n').length)
  assert.match(out, /query: Raspberry Pi Zero 2 W/)
})

test('updateTimes inserts after REMEMBER/TIME when absent, keeps last 8', () => {
  const out = updateTimes('POST //x\nREMEMBER', [1, 2, 3, 4, 5, 6, 7, 8, 9])
  assert.equal(out.split('\n')[2], 'TIMES 2 3 4 5 6 7 8 9')
})
