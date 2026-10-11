import assert from 'node:assert/strict'
import { ForgePointerGesture, panelShortcut } from '../src/minigames/forge/input.ts'

const gesture = new ForgePointerGesture()
assert.equal(gesture.end(1, .5, .5), null, 'an uncaptured release cannot activate a station')
gesture.begin(1, .5, .5)
gesture.move(1, .8, .5)
gesture.move(1, .5, .5)
assert.equal(gesture.end(1, .5, .5), 'cancel', 'looking out and back must not open a window')
gesture.begin(1, .5, .5)
assert.equal(gesture.begin(2, .7, .5), false, 'a second finger cannot replace the gesture')
assert.equal(gesture.end(2, .7, .5), null)
assert.equal(gesture.end(1, .502, .5), 'up', 'an intentional tap still works')
gesture.begin(1, .5, .5)
gesture.cancel()
assert.equal(gesture.end(1, .5, .5), null, 'focus loss cancels interaction')
const key = { code: 'KeyT', repeat: false, altKey: false, ctrlKey: false, metaKey: false }
assert.equal(panelShortcut(key), 'KeyT')
assert.equal(panelShortcut({ ...key, repeat: true }), null, 'holding T cannot repeatedly toggle Trade')
assert.equal(panelShortcut({ ...key, metaKey: true }), null, 'browser shortcuts cannot open game panels')
console.log('PASS Forge input: out-and-back drag, stray release, multitouch, cancellation, held and modified shortcuts.')
