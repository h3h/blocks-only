export type Option = { label: string; effect: string; instruction?: string }

export type Block = {
  type: 'change' | 'finding' | 'check' | 'warning' | 'question' | 'next' | 'unclassified'
  summary: string
  detail?: string
  why?: string
  level?: string
  status?: 'passed' | 'failed' | 'partial' | 'not_run'
  notChecked?: string
  severity?: string
  ifIgnored?: string
  options?: Option[]
  recommended?: number | null
  reason?: string
  whyNoFit?: string
}

export type Report = { headline: string; blocks: Block[] }

/** Prose rows of turns that ended in a report: each row's head row, and each head's count and fold. */
export type Notes = { head: Record<string, string>; count: Record<string, number>; open: Record<string, boolean> }

declare module 'claude-code' {
  interface PluginState {
    'blocks-only': {
      notes: Notes
      /** Per report (its tool_use_id): indexes of the blocks unfolded. */
      open: StateFamily<number[]>
      /** Per report: "block:option" of the option picked. */
      picked: StateFamily<string | null>
    }
  }
}
