import { expect, test } from 'claude-code/testing'

import type { Block } from '../types'
import { MAX_STRIKES, mustReport, sendsNote, validate } from './validate'

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

test('an option says what it sends only when its label and effect do not', () => {
  // The press that once sent a prompt its label never mentioned.
  const mismatch = {
    label: 'I sign all four, push, update, restart',
    effect: 'One chained command re-signs the four commits, pushes and updates; then restart and rerun test 2',
    instruction: 'Read README.md and hooks/validate.ts, tell me if the block table in the README matches the validator.',
  }
  expect(sendsNote(mismatch)).toBe(`Sends: "${mismatch.instruction}"`)
  expect(
    sendsNote({
      label: 'Fix README and validate level',
      effect: 'Adds the three rules to the README; validate.ts refuses a bad finding level, with a test; committed, not pushed',
      instruction:
        'Update the Blocks section of README.md to say every option needs label and effect. Make validate.ts refuse a finding whose level is not valid, and add a test case. Run the tests. Commit without pushing.',
    }),
  ).toBe('')
  expect(sendsNote({ label: 'Leave as is', effect: 'Ends here' })).toBe('Sends nothing.')
})
