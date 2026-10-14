import { PluginOption } from "vite"
import { minimatch } from "minimatch"
import path from "node:path"
import { exec, type ExecException } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'

interface CommandConfig {
  pattern: string | string[]
  run: string
  silent?: boolean
  throttle?: number
  startup?: boolean
  failOnError?: boolean
  wait?: boolean
  customOutput?: string | ((stdout: string) => string)
}

const defaultOptions = {
  silent: false,
  throttle: 500,
  startup: true,
  failOnError: false,
  wait: true,
}

type CommandOptions = typeof defaultOptions & CommandConfig

interface CommandState {
  options: CommandOptions
  patterns: string[]
  running?: Promise<void>
  cooldown?: Promise<void>
  queued?: Promise<void>
  queuedThrottle?: boolean
}

const execAsync = promisify(exec)

const execute = async ({ run, silent, customOutput, failOnError }: CommandOptions): Promise<void> => {
  try {
    const { stdout, stderr } = await execAsync(run, { maxBuffer: 10 * 1024 * 1024 })

    if (!silent) {
      if (stderr) console.error('\n'+stderr)
      if (!customOutput && stdout) console.log('\n'+stdout)
    }

    if (customOutput) {
      console.log(typeof customOutput === 'function' ? customOutput(stdout) : customOutput)
    }
  } catch (thrown) {
    // customOutput can throw anything, but Vite ignores falsy hook rejections
    const error: ExecException = thrown instanceof Error ? thrown : new Error(String(thrown), { cause: thrown })

    if (!silent) {
      console.error('\n'+error.message)
      if (error.stdout) console.log('\n'+error.stdout)
    }

    if (failOnError) {
      throw error
    }
  }
}

const start = (state: CommandState, throttle: boolean): Promise<void> => {
  if (throttle && state.options.throttle > 0) {
    const cooldown = delay(state.options.throttle).then(() => {
      if (state.cooldown === cooldown) state.cooldown = undefined
    })

    state.cooldown = cooldown
  }

  const execution = execute(state.options).finally(() => {
    if (state.running === execution) state.running = undefined
  })

  state.running = execution

  return execution
}

const idle = async (state: CommandState): Promise<void> => {
  while (state.running || state.cooldown) {
    await (state.running ?? state.cooldown)?.catch(() => {})
  }
}

// Never run the same command twice at once or more often than `throttle`:
// triggers during a run or its cooldown share a single follow-up run, so the
// final output always reflects the latest change
const schedule = (state: CommandState, throttle: boolean): Promise<void> => {
  if (state.queued) {
    // A hot update joining a queued startup run still throttles that run
    state.queuedThrottle ||= throttle
    return state.queued
  }

  if (!state.running && !state.cooldown) {
    return start(state, throttle)
  }

  const queued = idle(state).then(() => {
    state.queued = undefined
    return start(state, state.queuedThrottle ?? throttle)
  })

  state.queued = queued
  state.queuedThrottle = throttle

  return queued
}

// Only hot updates are throttled, as startup runs once per build
const run = (state: CommandState, throttle: boolean) => {
  const execution = schedule(state, throttle)

  if (state.options.wait) {
    return execution
  }

  // Errors are already logged by execute and nothing awaits a background run
  execution.catch(() => {})
}

export const command = (config: CommandConfig|CommandConfig[]): PluginOption => {
  const states: CommandState[] = (Array.isArray(config) ? config : [config]).map(item => {
    const options = { ...defaultOptions, ...item }

    return {
      options,
      patterns: Array.isArray(options.pattern) ? options.pattern : [options.pattern],
    }
  })

  return {
    name: "vite-plugin-command",

    async buildStart() {
      await Promise.all(states.map(state => {
        if (state.options.startup) {
          return run(state, false)
        }
      }))
    },

    async handleHotUpdate({ file, server }) {
      await Promise.all(states.map(state => {
        const shouldRun = state.patterns.some(pattern => minimatch(file, path.resolve(server.config.root, pattern)))

        if (shouldRun) {
          return run(state, true)
        }
      }))
    },
  }
}
