// Con el kit de Claude Code (claude plugin test): valida que Claude Code acepte el dibujo.
import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'clawd-gains',
  component: 'AbovePrompt',
  requestId: 'band',
  viewport: { columns: 120, rows: 30 },
  props: { hasSurvey: false, isWorking: true, maxRows: 12, bodyColumns: 115, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

// Lo que Claude Code respondería debajo del mod.
function world(on, env: Record<string, string> = {}, settings: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.store(on)
  mock.env(on, env)
  const blits: any[] = []
  on('ui.blit', ($, e) => { blits.push(e); return { value: {} } })
  on('ui.log', () => ({ value: undefined }))
  on('settings.read', () => ({ value: settings }))
  on('fs.read', () => ({ deny: 'no keybindings.json in tests' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: 'ok' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  return { clock, blits }
}

async function startTurn($, mode?: string) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  if (mode) await $.command.run({ command: 'gains', args: mode })
  await $.turn.start({ text: 'hola', turnId: 't1' })
}

test('modo discreto: nada al principio, la invitación si Claude tarda, el gimnasio al apretar x', async ($, on) => {
  const { clock } = world(on)
  await startTurn($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  await clock.advance(8100)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: 'Train Clawd' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '█████' })).toBeDefined()
  await ui.press({ key: 'tap' })
  const raster = await ui.find({ type: 'Raster' })
  expect(raster?.props).toMatchObject({ key: 'clawd', columns: 41, rows: 8 })
})

test('la terminal acepta el gimnasio: escena Raster de 41x8, contadores y la tecla', async ($, on) => {
  world(on)
  await startTurn($, 'siempre')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'BICEP CURLS' })).toBeDefined()
  await ui.press({ key: 'tap' })
  expect(await ui.find({ type: 'Text', text: '1/10' })).toBeDefined()
})

test('el bucle repinta la escena con blit mientras se ve el gimnasio', async ($, on) => {
  const { clock, blits } = world(on)
  await startTurn($, 'siempre')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'tap' })
  await clock.advance(400)
  expect(blits.length > 4).toBe(true)
  expect(blits[0]).toMatchObject({ requestId: 'band', key: 'clawd' })
})

test('en Ghostty la terminal acepta la imagen PNG', async ($, on) => {
  world(on, { TERM_PROGRAM: 'ghostty' })
  await startTurn($, 'siempre')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const image = await ui.find({ type: 'Image' })
  expect(image?.props).toMatchObject({ key: 'clawd', columns: 41, rows: 8, alt: 'Clawd training' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
})

test('con un permiso pendiente no hay tecla; vuelve cuando termina la herramienta', async ($, on) => {
  world(on)
  on('tool.check', () => ({ decision: 'ask' }))
  await startTurn($, 'siempre')
  await $.tool.check({ tool: 'Bash', input: { command: 'rm -rf build' } })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'tap' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /answer Claude first/ })).toBeDefined()
  await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  expect(await ui.find({ key: 'tap' })).toBeDefined()
})

test('festejo al terminar un turno entrenado, con sus colores de tema', async ($, on) => {
  const { clock } = world(on)
  await startTurn($, 'siempre')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  // irregular a propósito: un ritmo exacto cuenta como tecla sostenida
  for (let i = 0; i < 9; i++) { await clock.advance(95 + (i % 3) * 20); await ui.press({ key: 'tap' }) }
  expect(await ui.find({ type: 'Text', text: 'on fire!' })).toBeDefined()
  await $.turn.complete({ turnId: 't1', answer: '', durationMs: 1, isAborted: false, usage: null })
  await ui.redraw({ ...BAND.props, isWorking: false })
  expect(await ui.find({ type: 'Text', text: '🏆 NEW RECORD!' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '+9 reps' })).toBeDefined()
  await clock.advance(4000)
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
})

test('sin toques Clawd se cansa y lo dice', async ($, on) => {
  const { clock } = world(on)
  await startTurn($, 'siempre')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'tap' })
  await clock.advance(4500)
  expect(await ui.find({ type: 'Text', text: /keep going: x/ })).toBeDefined()
})

test('en español si Claude Code está en español', async ($, on) => {
  const { clock } = world(on, {}, { language: 'español' })
  await startTurn($)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await clock.advance(8100)
  await ui.redraw()
  expect(await ui.find({ type: 'Text', text: 'Entrená a Clawd' })).toBeDefined()
  await ui.press({ key: 'tap' })
  expect(await ui.find({ type: 'Text', text: 'CURL DE BÍCEPS' })).toBeDefined()
})

test('/gains abre un panel compacto que la terminal acepta', async ($, on) => {
  world(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await $.command.run({ command: 'gains', args: '' })
  const ui = await $.ui.mount({
    plugin: 'clawd-gains', component: 'Pane', requestId: 'clawd-gains', surface: 'terminal',
    viewport: { columns: 160, rows: 40 },
    props: { title: 'Clawd Gains', isFocused: true, bodyColumns: 140, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  })
  expect((await ui.find({ type: 'Raster' }))?.props).toMatchObject({ columns: 41, rows: 8 })
  await ui.press({ key: 'tap' })
  expect(await ui.find({ type: 'Text', text: '1/10' })).toBeDefined()
})

test('sin trabajo la banda queda como la dibuja Claude Code', async ($, on) => {
  world(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: false }, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('Desktop acepta la banda con el Clawd chico de texto', async ($, on) => {
  world(on)
  await startTurn($, 'siempre')
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: '▝▜██████▀' })).toBeDefined()
})
