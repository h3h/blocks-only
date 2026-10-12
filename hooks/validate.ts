import type { Block, Report } from '../types'

const LEVELS = ['low', 'medium', 'high', 'critical']
const STATUSES = ['passed', 'failed', 'partial', 'not_run']
const TYPES = ['change', 'finding', 'check', 'warning', 'question', 'next', 'unclassified']

const OPTION = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'A few words.' },
    effect: { type: 'string', description: 'What picking it does.' },
    instruction: { type: 'string', description: 'next only: sent verbatim as the user\'s next prompt when picked, so it must ask for exactly what the label says. Leave out for an option the user does themselves or that ends here.' },
  },
  required: ['label', 'effect'],
}

export const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sentence: the state of the work now.' },
    blocks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: TYPES },
          summary: { type: 'string', description: 'One line, at most 140 characters.' },
          detail: { type: 'string', description: 'Markdown, any length: description, logs, evidence. Shown folded.' },
          why: { type: 'string', description: 'finding: why it matters.' },
          level: { type: 'string', enum: LEVELS, description: 'finding, optional: how much it matters.' },
          status: { type: 'string', enum: STATUSES, description: 'check.' },
          notChecked: { type: 'string', description: 'check, partial or not_run: what was not checked.' },
          severity: { type: 'string', enum: LEVELS, description: 'warning.' },
          ifIgnored: { type: 'string', description: 'warning: what breaks if it is ignored.' },
          options: { type: 'array', items: OPTION, description: 'question, next: 2 to 6.' },
          recommended: { type: ['integer', 'null'], description: 'question, next: index of the recommended option from 0; null on a question with none.' },
          reason: { type: 'string', description: 'question, next: why that option, or why none. check, partial or not_run: why not.' },
          whyNoFit: { type: 'string', description: 'unclassified: why no other type fits.' },
        },
        required: ['type', 'summary'],
      },
    },
  },
  required: ['headline', 'blocks'],
}

const has = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

function blockErrors(block: Block, at: string): string[] {
  const errors: string[] = []
  const need = (field: keyof Block, why: string) => {
    if (!has(block[field])) errors.push(`${at} needs ${field}: ${why}`)
  }
  if (!TYPES.includes(block.type)) return [`${at} type must be one of ${TYPES.join(', ')}`]
  if (!has(block.summary)) errors.push(`${at} needs summary`)
  else if (block.summary.length > 140 || block.summary.includes('\n'))
    errors.push(`${at} summary must be one line of at most 140 characters; move the rest to detail`)

  if (block.type === 'finding') need('why', 'why the finding matters')
  if (block.type === 'unclassified') need('whyNoFit', 'why no other block type fits')
  if (block.type === 'warning') {
    if (!LEVELS.includes(block.severity ?? '')) errors.push(`${at} needs severity: ${LEVELS.join(', ')}`)
    need('ifIgnored', 'what breaks if it is ignored')
  }
  if (block.type === 'check') {
    if (!STATUSES.includes(block.status ?? '')) errors.push(`${at} needs status: ${STATUSES.join(', ')}`)
    else if (block.status === 'partial' || block.status === 'not_run') {
      need('notChecked', 'what was not checked')
      need('reason', 'why it was not checked')
    }
  }
  if (block.type === 'question' || block.type === 'next') {
    const options = Array.isArray(block.options) ? block.options : []
    if (options.length < 2 || options.length > 6) errors.push(`${at} needs 2 to 6 options`)
    options.forEach((option, i) => {
      if (!has(option?.label) || !has(option?.effect)) errors.push(`${at}.options[${i}] needs label and effect`)
    })
    need('reason', 'why the recommended option, or why there is none')
    const isIndex = Number.isInteger(block.recommended) && block.recommended! >= 0 && block.recommended! < options.length
    if (block.type === 'next') {
      if (!options.some(option => has(option?.instruction))) errors.push(`${at} needs an option with the instruction it sends`)
      if (!isIndex) errors.push(`${at} needs recommended: the index of an option`)
    } else if (block.recommended != null && !isIndex) errors.push(`${at} recommended must be the index of an option, or null`)
  }

  return errors
}

/** Every reason a report is refused; empty when it is accepted. */
export function validate(report: Partial<Report>): string[] {
  const errors: string[] = []
  if (!has(report.headline) || report.headline.includes('\n')) errors.push('headline must be one sentence on one line')
  if (!Array.isArray(report.blocks) || report.blocks.length === 0) return [...errors, 'blocks needs at least one block']

  return [...errors, ...report.blocks.flatMap((block, i) => blockErrors(block ?? ({} as Block), `blocks[${i}]`))]
}

export const MAX_STRIKES = 2

/** Whether the turn may not stop yet: it used tools, has no accepted report, and has reminders left. */
export const mustReport = (turn: { isOn: boolean; hasUsedTools: boolean; hasReported: boolean; strikes: number }) =>
  turn.isOn && turn.hasUsedTools && !turn.hasReported && turn.strikes < MAX_STRIKES
