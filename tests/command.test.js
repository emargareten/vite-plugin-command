import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { command } from '../dist/vite-plugin-command.js'

const shellQuote = value => process.platform === 'win32'
  ? '"' + value + '"'
  : "'" + value.replaceAll("'", "'\\''") + "'"

const createDirectory = async context => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vite-plugin-command-test-'))
  context.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

const createCommand = async (directory, name, source) => {
  const filename = path.join(directory, name + '.cjs')
  await writeFile(filename, source)
  return shellQuote(process.execPath) + ' ' + shellQuote(filename)
}

const mockOutput = context => ({
  logs: context.mock.method(globalThis.console, 'log', () => {}),
  errors: context.mock.method(globalThis.console, 'error', () => {}),
})

const hotUpdate = directory => ({
  file: path.join(directory, 'routes', 'web.php'),
  server: { config: { root: directory } },
})

test('startup runs commands concurrently and waits for every artifact', async context => {
  const directory = await createDirectory(context)
  const names = ['first', 'second']
  const commands = await Promise.all(names.map(async (name, index) => {
    const peer = names[1 - index]
    const run = await createCommand(directory, name, `
      const { existsSync, writeFileSync } = require('node:fs')
      writeFileSync(${JSON.stringify(path.join(directory, name + '.started'))}, 'started')
      const interval = setInterval(() => {
        if (existsSync(${JSON.stringify(path.join(directory, peer + '.started'))})) {
          clearInterval(interval)
          setTimeout(() => writeFileSync(${JSON.stringify(path.join(directory, name + '.txt'))}, ${JSON.stringify(name)}), 25)
        }
      }, 5)
      setTimeout(() => process.exit(9), 500).unref()
    `)

    return { pattern: '**/*', run, silent: true, failOnError: true }
  }))
  const plugin = command(commands)

  await plugin.buildStart()

  assert.deepEqual(
    await Promise.all(names.map(name => readFile(path.join(directory, name + '.txt'), 'utf8'))),
    names,
  )
})

test('startup failures remain non-fatal and preserve stdout without success output', async context => {
  const directory = await createDirectory(context)
  const artifact = path.join(directory, 'artifact.txt')
  const failingCommand = await createCommand(directory, 'fail', `
    process.stdout.write('before failure', () => {
      process.stderr.write('boom', () => process.exit(7))
    })
  `)
  const successfulCommand = await createCommand(directory, 'success', `
    require('node:fs').writeFileSync(${JSON.stringify(artifact)}, 'finished')
  `)
  const { logs, errors } = mockOutput(context)
  let successOutputCalls = 0
  const plugin = command([
    {
      pattern: '**/*',
      run: failingCommand,
      customOutput: () => {
        successOutputCalls++
        return 'Generated!'
      },
    },
    { pattern: '**/*', run: successfulCommand, silent: true },
  ])

  await plugin.buildStart()

  assert.equal(await readFile(artifact, 'utf8'), 'finished')
  assert.equal(errors.mock.callCount(), 1)
  assert.match(errors.mock.calls[0].arguments[0], /Command failed/)
  assert.equal(errors.mock.calls[0].arguments[0].match(/boom/g).length, 1)
  assert.equal(logs.mock.callCount(), 1)
  assert.equal(logs.mock.calls[0].arguments[0], '\nbefore failure')
  assert.equal(successOutputCalls, 0)
})

test('failOnError rejects startup while silent suppresses plugin logs', async context => {
  const directory = await createDirectory(context)
  const failingCommand = await createCommand(directory, 'fail', 'process.exit(7)')
  const { logs, errors } = mockOutput(context)
  const plugin = command({
    pattern: '**/*',
    run: failingCommand,
    silent: true,
    failOnError: true,
  })

  await assert.rejects(plugin.buildStart(), error => error.code === 7)

  assert.equal(logs.mock.callCount(), 0)
  assert.equal(errors.mock.callCount(), 0)
})

test('silent startup failures remain non-fatal without plugin logs', async context => {
  const directory = await createDirectory(context)
  const failingCommand = await createCommand(directory, 'fail', `
    process.stdout.write('before failure', () => process.exit(7))
  `)
  const { logs, errors } = mockOutput(context)
  const plugin = command({ pattern: '**/*', run: failingCommand, silent: true })

  await plugin.buildStart()

  assert.equal(logs.mock.callCount(), 0)
  assert.equal(errors.mock.callCount(), 0)
})

test('startup false skips artifact creation', async context => {
  const directory = await createDirectory(context)
  const artifact = path.join(directory, 'artifact.txt')
  const run = await createCommand(directory, 'generate', `
    require('node:fs').writeFileSync(${JSON.stringify(artifact)}, 'generated')
  `)
  const plugin = command({ pattern: '**/*', run, startup: false, silent: true })

  await plugin.buildStart()

  assert.equal(existsSync(artifact), false)
})

test('hot update failures remain non-fatal and log their error once', async context => {
  const directory = await createDirectory(context)
  const run = await createCommand(directory, 'fail', 'process.exit(7)')
  const { logs, errors } = mockOutput(context)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    startup: false,
    throttle: 0,
  })

  await plugin.handleHotUpdate(hotUpdate(directory))

  assert.equal(errors.mock.callCount(), 1)
  assert.match(errors.mock.calls[0].arguments[0], /Command failed/)
  assert.equal(logs.mock.callCount(), 0)
})

test('failOnError rejects hot updates while silent suppresses plugin logs', async context => {
  const directory = await createDirectory(context)
  const run = await createCommand(directory, 'fail', 'process.exit(7)')
  const { logs, errors } = mockOutput(context)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    startup: false,
    throttle: 0,
    silent: true,
    failOnError: true,
  })

  await assert.rejects(plugin.handleHotUpdate(hotUpdate(directory)), error => error.code === 7)

  assert.equal(logs.mock.callCount(), 0)
  assert.equal(errors.mock.callCount(), 0)
})

test('matching hot updates finish generation and log stdout', async context => {
  const directory = await createDirectory(context)
  const artifact = path.join(directory, 'artifact.txt')
  const run = await createCommand(directory, 'generate', `
    require('node:fs').writeFileSync(${JSON.stringify(artifact)}, 'generated')
    process.stdout.write('generated routes')
  `)
  const { logs, errors } = mockOutput(context)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    startup: false,
    throttle: 0,
  })

  await plugin.handleHotUpdate(hotUpdate(directory))

  assert.equal(await readFile(artifact, 'utf8'), 'generated')
  assert.equal(logs.mock.callCount(), 1)
  assert.equal(logs.mock.calls[0].arguments[0], '\ngenerated routes')
  assert.equal(errors.mock.callCount(), 0)
})

test('non-matching hot updates do not run commands or log output', async context => {
  const directory = await createDirectory(context)
  const artifact = path.join(directory, 'artifact.txt')
  const run = await createCommand(directory, 'generate', `
    require('node:fs').writeFileSync(${JSON.stringify(artifact)}, 'generated')
  `)
  const { logs, errors } = mockOutput(context)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    startup: false,
    throttle: 0,
  })

  await plugin.handleHotUpdate({
    file: path.join(directory, 'config', 'app.php'),
    server: { config: { root: directory } },
  })

  assert.equal(existsSync(artifact), false)
  assert.equal(logs.mock.callCount(), 0)
  assert.equal(errors.mock.callCount(), 0)
})

test('successful custom output replaces stdout even when silent is enabled', async context => {
  const directory = await createDirectory(context)
  const run = await createCommand(directory, 'generate', "process.stdout.write('routes')")
  const { logs, errors } = mockOutput(context)
  const plugin = command({
    pattern: '**/*',
    run,
    silent: true,
    customOutput: stdout => 'Generated: ' + stdout,
  })

  await plugin.buildStart()

  assert.equal(logs.mock.callCount(), 1)
  assert.equal(logs.mock.calls[0].arguments[0], 'Generated: routes')
  assert.equal(errors.mock.callCount(), 0)
})

test('non-matching files do not throttle a subsequent matching hot update', async context => {
  const directory = await createDirectory(context)
  const artifact = path.join(directory, 'artifact.txt')
  const run = await createCommand(directory, 'generate', `
    require('node:fs').writeFileSync(${JSON.stringify(artifact)}, 'generated')
  `)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    startup: false,
    throttle: 50,
    silent: true,
  })

  await plugin.handleHotUpdate({
    file: path.join(directory, 'config', 'app.php'),
    server: { config: { root: directory } },
  })
  await plugin.handleHotUpdate(hotUpdate(directory))

  assert.equal(await readFile(artifact, 'utf8'), 'generated')
})

for (const hook of ['buildStart', 'handleHotUpdate']) {
  for (const failOnError of [false, true]) {
    test(hook + ' respects failOnError for custom output exceptions: ' + failOnError, async context => {
      const directory = await createDirectory(context)
      const run = await createCommand(directory, 'generate', "process.stdout.write('routes')")
      const { logs, errors } = mockOutput(context)
      const plugin = command({
        pattern: 'routes/**/*.php',
        run,
        throttle: 0,
        failOnError,
        customOutput: () => {
          throw new Error('Formatting failed')
        },
      })
      const execution = hook === 'buildStart'
        ? plugin.buildStart()
        : plugin.handleHotUpdate(hotUpdate(directory))

      if (failOnError) {
        await assert.rejects(execution, /Formatting failed/)
      } else {
        await execution
      }

      assert.equal(errors.mock.callCount(), 1)
      assert.equal(errors.mock.calls[0].arguments[0], '\nFormatting failed')
      assert.equal(logs.mock.callCount(), 0)
    })
  }
}

for (const hook of ['buildStart', 'handleHotUpdate']) {
  test(hook + ' does not wait for commands when wait is false', async context => {
    const directory = await createDirectory(context)
    const artifact = path.join(directory, 'artifact.txt')
    const run = await createCommand(directory, 'generate', `
      setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(artifact)}, 'generated'), 100)
    `)
    const plugin = command({
      pattern: 'routes/**/*.php',
      run,
      throttle: 0,
      silent: true,
      wait: false,
    })

    if (hook === 'buildStart') {
      await plugin.buildStart()
    } else {
      await plugin.handleHotUpdate(hotUpdate(directory))
    }

    assert.equal(existsSync(artifact), false)

    while (!existsSync(artifact)) {
      await delay(10)
    }
  })

  test(hook + ' does not reject background failures when wait is false', async context => {
    const directory = await createDirectory(context)
    const run = await createCommand(directory, 'fail', 'process.exit(7)')
    const { errors } = mockOutput(context)
    const plugin = command({
      pattern: 'routes/**/*.php',
      run,
      throttle: 0,
      failOnError: true,
      wait: false,
    })
    const errorLogged = new Promise(resolve => {
      errors.mock.mockImplementation(resolve)
    })

    if (hook === 'buildStart') {
      await plugin.buildStart()
    } else {
      await plugin.handleHotUpdate(hotUpdate(directory))
    }

    assert.match(await errorLogged, /Command failed/)
  })
}

test('overlapping triggers never run a command concurrently and coalesce into one follow-up run', async context => {
  const directory = await createDirectory(context)
  const log = path.join(directory, 'log.txt')
  const run = await createCommand(directory, 'generate', `
    const { appendFileSync } = require('node:fs')
    appendFileSync(${JSON.stringify(log)}, 'start\\n')
    setTimeout(() => appendFileSync(${JSON.stringify(log)}, 'end\\n'), 100)
  `)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    throttle: 0,
    silent: true,
  })

  const startup = plugin.buildStart()
  await delay(20)
  const updates = [1, 2, 3].map(() => plugin.handleHotUpdate(hotUpdate(directory)))

  await Promise.all([startup, ...updates])

  assert.equal(await readFile(log, 'utf8'), 'start\nend\nstart\nend\n')
})

test('follow-up run still happens after the running command fails', async context => {
  const directory = await createDirectory(context)
  const log = path.join(directory, 'log.txt')
  const run = await createCommand(directory, 'generate', `
    const { appendFileSync, existsSync } = require('node:fs')
    const first = !existsSync(${JSON.stringify(log)})
    appendFileSync(${JSON.stringify(log)}, 'start\\n')
    setTimeout(() => {
      appendFileSync(${JSON.stringify(log)}, 'end\\n')
      process.exit(first ? 7 : 0)
    }, 100)
  `)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    throttle: 0,
    silent: true,
    failOnError: true,
  })

  const first = plugin.handleHotUpdate(hotUpdate(directory))
  await delay(10)
  const second = plugin.handleHotUpdate(hotUpdate(directory))

  await assert.rejects(first, error => error.code === 7)
  await second

  assert.equal(await readFile(log, 'utf8'), 'start\nend\nstart\nend\n')
})

test('saves during an active run queue a follow-up run despite the default throttle', async context => {
  const directory = await createDirectory(context)
  const log = path.join(directory, 'log.txt')
  const run = await createCommand(directory, 'generate', `
    const { appendFileSync } = require('node:fs')
    appendFileSync(${JSON.stringify(log)}, 'start\\n')
    setTimeout(() => appendFileSync(${JSON.stringify(log)}, 'end\\n'), 100)
  `)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    startup: false,
    silent: true,
  })

  const first = plugin.handleHotUpdate(hotUpdate(directory))
  await delay(20)
  await plugin.handleHotUpdate(hotUpdate(directory))
  await first

  assert.equal(await readFile(log, 'utf8'), 'start\nend\nstart\nend\n')
})

for (const thrown of [null, undefined]) {
  test('custom output throwing ' + thrown + ' remains non-fatal and is logged', async context => {
    const directory = await createDirectory(context)
    const run = await createCommand(directory, 'generate', "process.stdout.write('routes')")
    const { logs, errors } = mockOutput(context)
    const plugin = command({
      pattern: '**/*',
      run,
      customOutput: () => {
        throw thrown
      },
    })

    await plugin.buildStart()

    assert.equal(errors.mock.callCount(), 1)
    assert.equal(errors.mock.calls[0].arguments[0], '\n' + String(thrown))
    assert.equal(logs.mock.callCount(), 0)
  })
}

test('changes within the throttle window after a run get one trailing run that HMR waits for', async context => {
  const directory = await createDirectory(context)
  const log = path.join(directory, 'log.txt')
  const run = await createCommand(directory, 'generate', `
    require('node:fs').appendFileSync(${JSON.stringify(log)}, 'run\\n')
  `)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    startup: false,
    throttle: 300,
    silent: true,
  })

  await plugin.handleHotUpdate(hotUpdate(directory))
  assert.equal(await readFile(log, 'utf8'), 'run\n')

  await Promise.all([1, 2, 3].map(() => plugin.handleHotUpdate(hotUpdate(directory))))

  assert.equal(await readFile(log, 'utf8'), 'run\nrun\n')
})

for (const thrown of [null, undefined]) {
  test('failOnError rejects hot updates with an Error when custom output throws ' + thrown, async context => {
    const directory = await createDirectory(context)
    const run = await createCommand(directory, 'generate', "process.stdout.write('routes')")
    mockOutput(context)
    const plugin = command({
      pattern: 'routes/**/*.php',
      run,
      startup: false,
      throttle: 0,
      failOnError: true,
      customOutput: () => {
        throw thrown
      },
    })

    await assert.rejects(plugin.handleHotUpdate(hotUpdate(directory)), error => {
      assert.ok(error instanceof Error)
      assert.equal(error.message, String(thrown))
      assert.equal(error.cause, thrown)
      return true
    })
  })
}

test('a hot update joining a queued startup run still throttles the next run', async context => {
  const directory = await createDirectory(context)
  const log = path.join(directory, 'log.txt')
  const run = await createCommand(directory, 'generate', `
    const { appendFileSync } = require('node:fs')
    appendFileSync(${JSON.stringify(log)}, Date.now() + '\\n')
    setTimeout(() => {}, 100)
  `)
  const plugin = command({
    pattern: 'routes/**/*.php',
    run,
    throttle: 300,
    silent: true,
  })

  const first = plugin.buildStart()
  await delay(20)
  const queued = plugin.buildStart()
  const joined = plugin.handleHotUpdate(hotUpdate(directory))
  await Promise.all([first, queued, joined])
  await plugin.handleHotUpdate(hotUpdate(directory))

  const starts = (await readFile(log, 'utf8')).trim().split('\n').map(Number)
  assert.equal(starts.length, 3)
  assert.ok(starts[2] - starts[1] >= 280, 'third run started ' + (starts[2] - starts[1]) + 'ms after the second')
})
