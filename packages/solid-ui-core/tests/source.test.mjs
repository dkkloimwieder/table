import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COMBOBOX_INTL_TRANSLATIONS } from '../src/vendor/kobalte/core/src/combobox/combobox.intl.ts'

test('Combobox announces every result count', () => {
  assert.equal(
    COMBOBOX_INTL_TRANSLATIONS.countAnnouncement(0),
    '0 options available',
  )
  assert.equal(
    COMBOBOX_INTL_TRANSLATIONS.countAnnouncement(1),
    'one option available',
  )
  assert.equal(
    COMBOBOX_INTL_TRANSLATIONS.countAnnouncement(12),
    '12 options available',
  )
})
