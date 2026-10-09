import assert from 'node:assert/strict'
import test from 'node:test'
import {visibleWindow} from './checklist.js'

test('a short list shows whole', () => {
  assert.deepEqual(visibleWindow(5, 4, 8), [0, 5])
})

test('a long list scrolls to keep the cursor in the middle, clamped at both ends', () => {
  assert.deepEqual(visibleWindow(100, 0, 8), [0, 8])
  assert.deepEqual(visibleWindow(100, 50, 8), [46, 54])
  assert.deepEqual(visibleWindow(100, 99, 8), [92, 100])
})
