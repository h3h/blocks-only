import { expect, test } from 'claude-code/testing'

import type { Block } from '../types'
import { MAX_STRIKES, mustReport, validate } from './validate'

const report = (...blocks: Block[]) => validate({ headline: 'Done.', blocks })
const options = [
  { label: 'Run it', effect: 'Runs the suite', instruction: 'Run the suite.' },
  { label: 'Stop', effect: 'Ends here' },
]

test('a complete report is accepted', () => {
  expect(
    report(
      { type: 'change', summary: 'Edited one file.' },
      { type: 'finding', summary: 'Root cause found.', why: 'It explains the timeout.' },
      { type: 'check', summary: 'Unit suite.', status: 'passed' },
      { type: 'check', summary: 'Integration.', status: 'not_run', notChecked: 'Staging login', reason: 'No VPN' },
      { type: 'warning', summary: 'Mobile shares this.', severity: 'high', ifIgnored: 'Mobile waits 90s.' },
      { type: 'question', summary: 'Keep the column?', options, recommended: null, reason: 'Not visible in the repo.' },
      { type: 'next', summary: 'What next?', options, recommended: 0, reason: 'Cheapest proof.' },
      { type: 'unclassified', summary: 'Odd one.', whyNoFit: 'It is none of the others.' },
    ),
  ).toEqual([])
})

test('each block is refused without what it has to include', () => {
  const refused: Block[] = [
    { type: 'change', summary: '' },
    { type: 'change', summary: 'x'.repeat(141) },
    { type: 'finding', summary: 'Found.' },
    { type: 'check', summary: 'Checked.' },
    { type: 'check', summary: 'Checked.', status: 'partial', notChecked: 'Half' },
    { type: 'warning', summary: 'Risk.', severity: 'high' },
    { type: 'question', summary: 'Which?', options: [options[0]!], reason: 'Because.' },
    { type: 'question', summary: 'Which?', options },
    { type: 'next', summary: 'Next?', options: [options[1]!, options[1]!], recommended: 0, reason: 'Because.' },
    { type: 'next', summary: 'Next?', options, recommended: null, reason: 'Because.' },
    { type: 'unclassified', summary: 'Odd.' },
  ]
  for (const block of refused) expect(report(block).length).toBeGreaterThan(0)
})

test('a report needs a headline and a block', () => {
  expect(validate({ blocks: [{ type: 'change', summary: 'Edited.' }] }).length).toBe(1)
  expect(validate({ headline: 'Done.', blocks: [] }).length).toBe(1)
})

test('a turn must report only when on, after tools, with reminders left', () => {
  const turn = { isOn: true, hasUsedTools: true, hasReported: false, strikes: 0 }
  expect(mustReport(turn)).toBe(true)
  expect(mustReport({ ...turn, isOn: false })).toBe(false)
  expect(mustReport({ ...turn, hasUsedTools: false })).toBe(false)
  expect(mustReport({ ...turn, hasReported: true })).toBe(false)
  expect(mustReport({ ...turn, strikes: MAX_STRIKES })).toBe(false)
})
