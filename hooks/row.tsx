import type { ClientModule } from 'claude-code'

export type RowProps = { summary: string; word: string; tone: string; isOpen: boolean }

/** The head of a block that has more to show: the whole line is the press that folds and unfolds it. */
const RowHead: ClientModule<RowProps, { isOver: boolean }> = (props, surface) => {
  const { Box, Text } = surface.elements

  surface.onPointer(event => {
    if (event.type === 'enter' || event.type === 'leave') surface.setState({ isOver: event.type === 'enter' })
    const isInside = event.x >= 0 && event.y >= 0 && event.x < surface.columns && event.y < surface.rows
    if (event.type === 'up' && event.button === 'left' && isInside) surface.post({})
  })

  return (
    <Box gap={1}>
      <Box flexGrow={1} flexShrink={1}>
        <Text>{props.summary}</Text>
      </Box>
      {props.word !== '' && (
        <Box flexShrink={0}>
          <Text color={props.tone}>{props.word}</Text>
        </Box>
      )}
      <Box flexShrink={0}>
        <Text dimColor={surface.state?.isOver !== true}>{props.isOpen ? '▾' : '▸'}</Text>
      </Box>
    </Box>
  )
}

export default RowHead
