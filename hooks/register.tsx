import { atom, memberOf, read, update } from 'claude-code'
import type { EngineInterface, Register, ResolveInput } from 'claude-code'

import type { Block, Notes, Option, Report } from '../types'
import type { OptionProps } from './option'
import type { RowProps } from './row'
import { MAX_STRIKES, mustReport, SCHEMA, validate } from './validate'

const REPORT = 'mcp__blocks-only__report'
const COMMAND = 'blocks-output'

const SECTION = {
  id: 'blocks-only:report',
  scope: 'session',
  text: `# Reporting your work
When a turn has used any tool, end it by calling the ${REPORT} tool, and write nothing after it: no summary, no recap, no closing line. The user reads only that report. Do not narrate what you tried.
Put each thing the user needs in the block type made for it: change (edits and other output), finding (something learned), check (how the work was checked, including what was not checked and why), warning (a risk or blocker), question (only the user can settle it), next (a proposed continuation, with the instruction each option sends), unclassified (last resort). Each summary is one line; anything longer goes in that block's detail, which the user unfolds if they want it. A turn that used no tool is a conversation: answer it in plain prose.`,
} as const

const notes = atom({ plugin: 'blocks-only', key: 'notes' } as const, { head: {}, count: {}, open: {} })
const open = atom({ plugin: 'blocks-only', key: 'open' } as const, [])
const picked = atom({ plugin: 'blocks-only', key: 'picked' } as const, null)
const plain = atom({ plugin: 'blocks-only', key: 'isPlain' } as const, false)

// Orange and red are kept for what is urgent: a high or critical level, a failed check.
// Two fills of one neutral hue, a step apart in strength; translucent, so they read on a light theme and a dark one.
const STRIPES = ['#80808014', '#80808024'] as const
const TONE = { blue: '#4a86c7', purple: '#8b6fc9', gray: '#8a8880', orange: '#d9822b', red: '#d0483e' }
const PATHS = {
  change: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13 7l4 4"/>',
  finding: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  passed: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  failed: '<path d="M6 6l12 12M18 6L6 18"/>',
  not_run: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 4"/>',
  warning: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  question: '<path d="M9 9a3 3 0 1 1 4.5 2.6c-1 .6-1.5 1.2-1.5 2.4M12 18v.5"/>',
  next: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  unclassified: '<path d="M6 12h.5M12 12h.5M18 12h.5"/>',
}

const urgent = (level: string | undefined, calm: string) =>
  level === 'critical' ? TONE.red : level === 'high' ? TONE.orange : calm

/** A block's icon, its colour, and the word beside its summary. */
function look(block: Block): { icon: keyof typeof PATHS; tone: string; word?: string } {
  switch (block.type) {
    case 'change':
      return { icon: 'change', tone: TONE.blue }
    case 'finding':
      return { icon: 'finding', tone: urgent(block.level, TONE.purple), word: block.level }
    case 'check': {
      const status = block.status ?? 'not_run'
      const icon = status === 'passed' || status === 'failed' ? status : 'not_run'
      const tone = status === 'failed' ? TONE.red : TONE.gray
      return { icon, tone, word: status.replace('_', ' ') }
    }
    case 'warning':
      return { icon: 'warning', tone: urgent(block.severity, TONE.gray), word: block.severity }
    case 'question':
      return { icon: 'question', tone: TONE.purple }
    case 'next':
      return { icon: 'next', tone: TONE.purple }
    default:
      return { icon: 'unclassified', tone: TONE.gray }
  }
}

const badge = (icon: keyof typeof PATHS, tone: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="12" fill="${tone}"/><g transform="translate(4.8 4.8) scale(.6)" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${PATHS[icon]}</g></svg>`

/** What a block has to show without unfolding. */
function required(block: Block): string | undefined {
  if (block.type === 'warning') return `If ignored: ${block.ifIgnored}`
  if (block.type === 'check' && block.notChecked) return `Not checked: ${block.notChecked}. Why: ${block.reason}`
  if (block.type === 'unclassified') return `No other block fits: ${block.whyNoFit}`
  return undefined
}

const folded = (block: Block) =>
  [block.type === 'finding' ? (block.why ?? '') : '', block.detail ?? '']
    .filter(Boolean)
    .join('\n\n')

const isDecision = (block: Block) => block.type === 'question' || block.type === 'next'
const SECTIONS = {
  needs: { title: 'Needs you', has: (b: Block) => isDecision(b) || b.type === 'warning' },
  happened: { title: 'What happened', has: (b: Block) => !isDecision(b) && b.type !== 'warning' && b.type !== 'check' },
  verify: { title: 'Verification', has: (b: Block) => b.type === 'check' },
}
const ORDERS: Record<string, (keyof typeof SECTIONS)[]> = {
  'decisions-first': ['needs', 'happened', 'verify'],
  'verification-first': ['verify', 'needs', 'happened'],
}

/** Marks the option picked and sends what it stands for as the person's own prompt. */
async function pick($: EngineInterface, report: string, block: number, index: number, text: string | null) {
  await update($, memberOf(picked, { requestId: report }), () => `${block}:${index}`)
  // Not awaited: it resolves when the next turn starts.
  if (text) void $.prompt.submit({ text, asUser: true }).catch(() => {})
}

/** What picking an option sends: a question's answer, or a next step's instruction; null when it ends here. */
function sends(block: Block, option: Option) {
  return block.type === 'question' ? `${block.summary} ${option.label}` : (option.instruction ?? null)
}

type Call = { input: unknown; isRunning: boolean; isErrored: boolean; output?: unknown }

/** One report call drawn as its card; null when its input is no valid report. */
async function card($: EngineInterface, e: ResolveInput & { surface: 'desktop' }, call: Call, id: string, orderName: string) {
  const { Box, Button, Client, Markdown, Svg, Text } = $.ui.resolve(e)
  if (call.isRunning) return <Text dimColor>Writing report…</Text>
  if (call.isErrored) return <Text color={TONE.red}>{String(call.output ?? 'Report refused.')}</Text>

  const report = call.input as Report
  if (validate(report).length > 0) return null
  const unfolded = await read($, memberOf(open, { requestId: id }))
  const choice = await read($, memberOf(picked, { requestId: id }))
  const isPlain = await read($, plain)

  // One block as a row: icon, summary, the fold mark at the far edge; what it must show sits under the summary.
  const tile = (block: Block, i: number) => {
    const { icon, tone, word } = look(block)
    const more = folded(block)
    const isOpen = unfolded.includes(i)
    const must = required(block)
    const rec = block.recommended ?? -1
    const isSettled = choice?.startsWith(`${i}:`) === true

    return (
      <Box gap={2} alignItems="flex-start">
        <Svg source={badge(icon, tone)} alt={block.type} width={20} height={20} />
        <Box flexDirection="column" flexGrow={1}>
          {more !== '' && !isPlain ? (
            <Client
              key={`fold:${id}:${i}`}
              module="./row.tsx"
              width="100%"
              props={{ summary: block.summary, word: word ?? '', tone, isOpen } satisfies RowProps}
            />
          ) : (
            <Box gap={1}>
              <Box flexGrow={1} flexShrink={1}>
                <Text>{block.summary}</Text>
              </Box>
              {word && (
                <Box flexShrink={0}>
                  <Text color={tone}>{word}</Text>
                </Box>
              )}
              {more !== '' && (
                <Button
                  key={`fold-${i}`}
                  plain
                  dimColor
                  label={isOpen ? '▾' : '▸'}
                  onPress={() =>
                    update($, memberOf(open, { requestId: id }), (now: number[]) =>
                      now.includes(i) ? now.filter(one => one !== i) : [...now, i],
                    )
                  }
                />
              )}
            </Box>
          )}
          {must && <Text dimColor>{must}</Text>}
          {isOpen && more !== '' && (
            <Box paddingLeft={2} paddingY={1}>
              <Markdown text={more} />
            </Box>
          )}
          {block.options && (
            <Box flexDirection="column" marginTop={1}>
              {block.options.map((option, j) => {
                const isPicked = choice === `${i}:${j}`
                const isMarked = isSettled ? isPicked : j === rec

                if (!isPlain) {
                  const props: OptionProps = {
                    n: j + 1,
                    label: option.label,
                    effect: option.effect,
                    mark: isMarked ? (isSettled ? 'picked' : 'recommended') : '',
                    isLive: !isSettled,
                    isDim: isSettled && !isPicked,
                    text: sends(block, option),
                    tone: TONE.purple,
                  }

                  return <Client key={`pick:${id}:${i}:${j}`} module="./option.tsx" props={props} />
                }

                // Drawn when the surface could not run the option module: only the label is the press.
                return (
                  <Box
                    key={`option-${i}-${j}`}
                    borderStyle="round"
                    borderDimColor={!isMarked}
                    {...(isMarked ? { borderColor: TONE.purple } : {})}
                    {...(isSettled ? {} : { hover: { borderColor: TONE.purple } })}
                    paddingX={2}
                    gap={2}
                  >
                    <Text dimColor>{String(j + 1)}</Text>
                    <Box flexDirection="column" flexGrow={1}>
                      <Box gap={1} flexWrap="wrap">
                        {isSettled ? (
                          <Text dimColor={!isPicked}>{option.label}</Text>
                        ) : (
                          <Button
                            key={`pick-${i}-${j}`}
                            plain
                            label={option.label}
                            onPress={() => pick($, id, i, j, sends(block, option))}
                          />
                        )}
                        {isMarked && <Text color={TONE.purple}>{isSettled ? 'picked' : 'recommended'}</Text>}
                      </Box>
                      <Text dimColor>{option.effect}</Text>
                    </Box>
                  </Box>
                )
              })}
              {block.reason && !isSettled && (
                <Text dimColor>{rec >= 0 ? `Why ${rec + 1}: ${block.reason}` : `No recommendation: ${block.reason}`}</Text>
              )}
            </Box>
          )}
        </Box>
      </Box>
    )
  }

  const indexed = report.blocks.map((block, i) => ({ block, i }))
  const order = ORDERS[orderName]

  const shown = (order ?? []).filter(name => indexed.some(({ block }) => SECTIONS[name].has(block)))

  return (
    <Box borderStyle="round" flexDirection="column" gap={1}>
      <Box paddingX={2} paddingTop={1}>
        <Text bold>{report.headline}</Text>
      </Box>
      {order === undefined ? (
        <Box flexDirection="column" gap={1} paddingX={2} paddingBottom={1}>
          {indexed.map(({ block, i }) => tile(block, i))}
        </Box>
      ) : (
        shown.map((name, at) => (
          <Box flexDirection="column" gap={1} paddingX={2} paddingY={1} backgroundColor={STRIPES[at % 2]!}>
            <Text dimColor>{SECTIONS[name].title.toUpperCase()}</Text>
            {indexed.filter(({ block }) => SECTIONS[name].has(block)).map(({ block, i }) => tile(block, i))}
          </Box>
        ))
      )}
    </Box>
  )
}

export const register: Register = (on, options) => {
  let isOn = true
  // The main loop's current turn; a hot reload starts it over, which only costs that turn its gate.
  let turn = { hasUsedTools: false, hasReported: false, strikes: 0, rows: [] as string[] }

  on('session.start', async ($, e, next) => {
    isOn = (await $.store.get('isOn')) !== false
    await $.tool.register({
      name: 'report',
      description:
        'Report your work to the user as typed blocks. This is the only way to tell the user what happened on a turn that used tools; call it last and write nothing after it. A report that leaves out what a block has to include is refused with the list of what is missing.',
      inputSchema: SCHEMA,
      isDeferred: false,
    })
    try {
      await $.command.register({
        name: COMMAND,
        description: 'Typed block reports on coding turns: on, off, or nothing to show which',
        argumentHint: '[on|off]',
      })
    } catch {
      // The name is taken: the mod works without its switch.
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'on' || arg === 'off') {
      isOn = arg === 'on'
      await $.store.set('isOn', isOn)
    } else if (arg !== '') return { text: `Usage: /${COMMAND} [on|off]` }

    return { text: `Typed block reports are ${isOn ? 'on' : 'off'}.` }
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return isOn ? { sections: [...composed.sections, SECTION] } : composed
  })

  on('turn.start', ($, e, next) => {
    turn = { hasUsedTools: false, hasReported: false, strikes: 0, rows: [] }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (String(e.tool) !== REPORT) {
      if (e.agentId === undefined) turn = { ...turn, hasUsedTools: true, hasReported: false }

      return next(e)
    }
    if (!isOn) return { deny: `Typed block reports are off (/${COMMAND} on). Answer in prose.` }

    const report = e as unknown as Report
    const errors = validate(report)
    if (errors.length > 0) return { deny: `Report refused. Fix these and call it again:\n- ${errors.join('\n- ')}` }

    if (e.agentId === undefined) turn.hasReported = true

    return { result: 'Report accepted and shown to the user. End your turn now and write nothing more.' }
  }).catch(($, e, next) => next(e))

  on('classic.Stop', ($, e, next) => {
    if (!mustReport({ ...turn, isOn })) return next(e)
    turn.strikes += 1

    return { block: `This turn used tools, so it has to end with the ${REPORT} tool. Call it now and write nothing after it.` }
  })

  // The turn's prose rows, so they can fold once the turn ends in a report.
  on('session.append', { door: 'response' }, ($, e, next) => {
    const hasText = e.message.content.some(block => block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '')
    if (e.agentId === undefined && hasText) turn.rows.push(e.uuid)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const head = turn.rows[0]
    if (turn.hasReported && head !== undefined) {
      const rows = turn.rows
      // shortcut: one entry per folded row for the session's life; prune by age if sessions grow huge.
      await update($, notes, (now: Notes) => ({
        head: { ...now.head, ...Object.fromEntries(rows.map(row => [row, head])) },
        count: { ...now.count, [head]: rows.length },
        open: now.open,
      }))
    } else if (isOn && turn.hasUsedTools && turn.strikes >= MAX_STRIKES) {
      $.ui.log('blocks-only: the turn ended with no report after two reminders.')
    }

    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    const all = await read($, notes)
    const head = all.head[e.requestId]
    if (head === undefined) return next(e)

    const { Box, Button } = $.ui.resolve(e)
    const isOpen = all.open[head] === true
    if (e.requestId !== head) return isOpen ? next(e) : <Box />
    const count = all.count[head] ?? 1

    return (
      <Box flexDirection="column">
        <Button
          key="notes"
          plain
          dimColor
          label={`${isOpen ? '▾' : '▸'} Working notes · ${count} ${count === 1 ? 'message' : 'messages'}`}
          onPress={() => update($, notes, (now: Notes) => ({ ...now, open: { ...now.open, [head]: !isOpen } }))}
        />
        {isOpen && (await next(e))}
      </Box>
    )
  })

  on('ui.render', { component: 'ToolResult' }, ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.tool !== REPORT) return next(e)
    const { Box } = $.ui.resolve(e)

    // The ToolUse row is the whole report.
    return <Box />
  })

  // A press on one of the card's modules: its key names what was pressed, as kind:report:block[:option].
  on('ui.message', async ($, e, next) => {
    const [kind, report, block, index] = e.element.split(':')
    const i = Number(block)
    if (report === undefined || !Number.isInteger(i)) return next(e)
    if (kind === 'fold') {
      await update($, memberOf(open, { requestId: report }), (now: number[]) =>
        now.includes(i) ? now.filter(one => one !== i) : [...now, i],
      )
    }
    if (kind === 'pick') {
      const text = (e.data as { text?: unknown } | null)?.text
      const { value } = await $.state.get({ plugin: 'blocks-only', key: 'picked', id: report } as const)
      if (value == null) await pick($, report, i, Number(index), typeof text === 'string' ? text : null)
    }

    return next(e)
  })

  on('ui.fault', async ($, e, next) => {
    await update($, plain, () => true)

    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.tool !== REPORT) return next(e)

    return (await card($, e, e.props, e.requestId, String(options.order ?? 'decisions-first'))) ?? next(e)
  })

  // Desktop folds a report call into the run of reads before it; the card is drawn under that run's line.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const reports = e.props.calls.filter(call => call.tool === REPORT && call.tool_use_id !== undefined)
    if (e.surface !== 'desktop' || e.props.isExpanded || reports.length === 0) return next(e)
    const { Box } = $.ui.resolve(e)
    const cards = []
    for (const call of reports) cards.push(await card($, e, call, call.tool_use_id!, String(options.order ?? 'decisions-first')))

    return (
      <Box flexDirection="column">
        {await next(e)}
        {cards}
      </Box>
    )
  })
}
