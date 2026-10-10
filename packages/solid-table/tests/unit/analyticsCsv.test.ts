import { expect, test } from 'vitest'
import { toCsv } from '../../bench/analytics/csv'

test('CSV preserves scalar values and escapes Unicode, commas, quotes and line breaks', () => {
  expect(
    toCsv(
      ['A,B', 'Title "one"', 'Résumé'],
      [
        [0, false, null],
        ['a\nb', 'a\rb', '雪'],
      ],
    ),
  ).toBe('"A,B","Title ""one""",Résumé\r\n0,false,\r\n"a\nb","a\rb",雪\r\n')
})

test('CSV treats formula-like text as spreadsheet text without changing negative numbers', () => {
  expect(
    toCsv(
      ['=header'],
      [['=1+1', '+SUM(A1)', '-2', '@name', '\tformula', '\rformula', -2]],
    ),
  ).toBe(
    "'=header\r\n'=1+1,'+SUM(A1),'-2,'@name,'\tformula,\"'\rformula\",-2\r\n",
  )
})

test('CSV includes headers when the current filter returns no rows', () => {
  expect(toCsv(['Name', 'Value'], [])).toBe('Name,Value\r\n')
})
