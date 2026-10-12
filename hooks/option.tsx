import type { ClientModule } from 'claude-code'

export type OptionProps = {
  n: number
  label: string
  effect: string
  /** `recommended`, `picked`, or '' for neither. */
  mark: string
  isLive: boolean
  isDim: boolean
  /** What picking it sends as the next prompt; null for an option that ends here. */
  text: string | null
  /** What a press sends, said only when the label and effect do not already say it; '' otherwise. */
  note: string
  tone: string
}

/** One option of a question or next block: the whole bordered block is the press. */
const OptionBlock: ClientModule<OptionProps, { isOver: boolean }> = (props, surface) => {
  const { Box, Text } = surface.elements
  const isLit = props.mark !== '' || (props.isLive && surface.state?.isOver === true)

  surface.onPointer(event => {
    if (!props.isLive) return
    if (event.type === 'enter' || event.type === 'leave') surface.setState({ isOver: event.type === 'enter' })
    const isInside = event.x >= 0 && event.y >= 0 && event.x < surface.columns && event.y < surface.rows
    if (event.type === 'up' && event.button === 'left' && isInside) surface.post({ text: props.text })
  })

  return (
    <Box borderStyle="round" borderDimColor={!isLit} {...(isLit ? { borderColor: props.tone } : {})} paddingX={2} gap={2}>
      <Text dimColor>{String(props.n)}</Text>
      <Box flexDirection="column" flexGrow={1}>
        <Box gap={1} flexWrap="wrap">
          <Text dimColor={props.isDim}>{props.label}</Text>
          {props.mark !== '' && <Text color={props.tone}>{props.mark}</Text>}
        </Box>
        <Text dimColor>{props.effect}</Text>
        {props.note !== '' && <Text dimColor italic>{props.note}</Text>}
      </Box>
    </Box>
  )
}

export default OptionBlock
