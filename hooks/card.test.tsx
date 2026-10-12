import { expect, test } from 'claude-code/testing'

const props = {
  tool_use_id: 'r1',
  tool: 'mcp__blocks-only__report' as const,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  input: {
    headline: 'Retries now work.',
    blocks: [
      { type: 'finding', summary: 'One signal was shared.', why: 'Slow networks got one attempt.', detail: 'Traced it.' },
      { type: 'check', summary: 'Integration.', status: 'not_run', notChecked: 'Staging login', reason: 'No VPN' },
      {
        type: 'next',
        summary: 'What next?',
        options: [
          { label: 'Scope to web', effect: 'Mobile keeps 30s', instruction: 'Give mobile its own config.' },
          { label: 'Leave as is', effect: 'Ends here' },
        ],
        recommended: 0,
        reason: 'The ticket is web only.',
      },
    ],
  },
}

test('a report draws as a card on desktop, folds, and takes a pick', async $ => {
  const ui = await $.ui.mount({ plugin: 'blocks-only', surface: 'desktop', component: 'ToolUse', requestId: 'r1', props })
  expect(await ui.find({ type: 'Text', text: /Retries now work/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Not checked: Staging login/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()

  await ui.press({ key: 'fold-0' })
  expect(await ui.find({ type: 'Markdown' })).toBeDefined()

  await ui.press({ key: 'pick-2-1' })
  expect(await ui.find({ type: 'Text', text: /^picked$/ })).toBeDefined()
  await ui.unmount()
})

test('the report row hides its result, and a report is refused or accepted', async $ => {
  const result = await $.ui.mount({
    plugin: 'blocks-only',
    surface: 'desktop',
    component: 'ToolResult',
    requestId: 'r1',
    props: { tool_use_id: 'r1', tool: props.tool, output: 'ok', isErrored: false },
  })
  expect(await result.find({ type: 'Text' })).toBeUndefined()
  await result.unmount()

  const refused = await $.tool.call({ tool: props.tool, tool_use_id: 'r2', headline: 'Done.', blocks: [{ type: 'finding', summary: 'x' }] })
  expect(refused.deny).toContain('blocks[0] needs why')
  const accepted = await $.tool.call({ tool: props.tool, tool_use_id: 'r3', ...props.input })
  expect(accepted.deny).toBeUndefined()
})

test('a report folded into a run of tool calls still draws its card', async ($, on) => {
  // Stands for the engine's own count line.
  on('ui.render', { component: 'ToolGroup' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>Read 2 files, used a tool</Text>
  })
  const { tool_use_id, ...call } = props
  const ui = await $.ui.mount({
    plugin: 'blocks-only',
    surface: 'desktop',
    component: 'ToolGroup',
    requestId: 'g1',
    props: { calls: [{ ...call, tool_use_id }], isActive: false, isExpanded: false },
  })
  expect(await ui.find({ type: 'Text', text: /used a tool/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Retries now work/ })).toBeDefined()
  await ui.press({ key: 'pick-2-1' })
  expect(await ui.find({ type: 'Text', text: /^picked$/ })).toBeDefined()
  await ui.unmount()
})
