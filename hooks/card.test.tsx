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
  expect(await ui.find({ type: 'Text', text: /Picked: Leave as is/ })).toBeDefined()
  await ui.unmount()
})

test('the report row hides its result, and an accepted report puts its decision above the prompt', async ($, on) => {
  // Stands for the engine's own empty band beneath the mod.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
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
  const band = await $.ui.mount({
    plugin: 'blocks-only',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: { offset: 0, bodyRows: 6 }, view: {} },
  })
  expect(await band.find({ key: 'band-0' })).toBeDefined()
  await band.unmount()
})
