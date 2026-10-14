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

test('a report draws as a card on desktop, folds, and takes a pick', async ($, on) => {
  // Stands for the engine taking the prompt a pick sends.
  let sent = ''
  on('prompt.submit', ($, e) => {
    sent = e.text

    return { text: e.text }
  })
  const ui = await $.ui.mount({ plugin: 'blocks-only', surface: 'desktop', component: 'ToolUse', requestId: 'r1', props })
  expect(await ui.find({ type: 'Text', text: /Retries now work/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Not checked: Staging login/ })).toBeDefined()
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()

  await ui.post({}, { in: 'fold:r1:0' })
  expect(await ui.find({ type: 'Markdown' })).toBeDefined()

  await ui.post({ text: 'Give mobile its own config.' }, { in: 'pick:r1:2:0' })
  expect(sent).toBe('Give mobile its own config.')
  // A second press on a settled report sends nothing.
  await ui.post({ text: 'Again.' }, { in: 'pick:r1:2:1' })
  expect(sent).toBe('Give mobile its own config.')
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
  expect(await ui.find({ key: 'pick:r1:2:0' })).toBeDefined()
  await ui.unmount()
})

test('an option whose instruction strays from its label shows what it will send', async $ => {
  const stray = { label: 'I push it myself', effect: 'You run the command, then restart', instruction: 'Read the README and summarise it.' }
  const input = { ...props.input, blocks: [{ type: 'next', summary: 'Next?', options: [stray, { label: 'Stop', effect: 'Ends here' }], recommended: 0, reason: 'Because.' }] }
  const ui = await $.ui.mount({ plugin: 'blocks-only', surface: 'desktop', component: 'ToolUse', requestId: 'r9', props: { ...props, tool_use_id: 'r9', input } })
  expect(await ui.find({ type: 'Text', text: 'Sends: "Read the README and summarise it."', in: 'pick:r9:0:0' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Sends nothing.', in: 'pick:r9:0:1' })).toBeDefined()
  await ui.unmount()
})

test('prose drawn during a turn that ends in a report folds into working notes', async ($, on) => {
  // Stands for the engine's own drawing of a message.
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.text}</Text>
  })
  on('turn.start', () => ({ turnId: 't1' }))
  on('turn.complete', () => ({ text: '' }))
  const draw = (requestId: string, text: string) =>
    $.ui.mount({ plugin: 'blocks-only', surface: 'desktop', component: 'AssistantMessage', requestId, props: { text, isFirstOfReply: true } })

  const old = await draw('msg_old-t0', 'From an earlier turn.')
  await $.turn.start({ text: 'go', turnId: 't1' })
  const first = await draw('msg_a-t0', 'Looking at the client.')
  const second = await draw('msg_b-t0', 'Found it.')
  await $.tool.call({ tool: props.tool, tool_use_id: 'r5', ...props.input })
  await $.turn.complete({ answer: 'Found it.', reason: 'answer', isAborted: false, turnId: 't1', durationMs: 1 })

  expect(await first.find({ type: 'Button', text: /Working notes · 2 messages/ })).toBeDefined()
  expect(await first.find({ type: 'Text', text: 'Looking at the client.' })).toBeUndefined()
  expect(await second.find({ type: 'Text', text: 'Found it.' })).toBeUndefined()
  expect(await old.find({ type: 'Text', text: 'From an earlier turn.' })).toBeDefined()

  await first.press({ key: 'notes' })
  expect(await first.find({ type: 'Text', text: 'Looking at the client.' })).toBeDefined()
  expect(await second.find({ type: 'Text', text: 'Found it.' })).toBeDefined()
})
