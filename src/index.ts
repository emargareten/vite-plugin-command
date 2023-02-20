import { PluginOption } from "vite"
import minimatch from "minimatch"
import path from "node:path"
import { exec } from 'node:child_process'

interface CommandConfig {
  pattern: string | string[]
  run: string
  silent?: boolean
  throttle?: number
  startup?: boolean
  customOutput?: string
}

const execute = (command: string, silent: boolean, customOutput?: string) => {
  exec(command, (error, stdout, stderr) => {
    if (!silent) {
      if (error) console.error(error.message)
      if (stderr) console.error(stderr)
      if (stdout) console.log(stdout)
    }
    if (customOutput) console.log(customOutput)
  })
}

export const command = (config: CommandConfig|CommandConfig[]): PluginOption => {
  const items = Array.isArray(config) ? config : [config];

  const defaultOptions = {
    silent: false,
    throttle: 500,
    startup: true,
  }

  const throttled: boolean[] = []

  items.forEach((item, index) => {
    throttled[index] = false
  })

  return {
    name: "vite-plugin-command",

    buildStart() {
      items.forEach(item => {
        const options = { ...defaultOptions, ...item }

        if (options.startup) {
          execute(options.run, options.silent, options.customOutput)
        }
      })
    },

    handleHotUpdate({ file, server }) {

      items.forEach((item, index) => {

        if (throttled[index]) {
          return
        }

        throttled[index] = true

        const options = {...defaultOptions, ...item}

        setTimeout(() => (throttled[index] = false), options.throttle)

        const patterns = Array.isArray(options.pattern) ? options.pattern : Array.of(options.pattern)

        const shouldRun = patterns.find((pattern) => minimatch(file, path.resolve(server.config.root, pattern)))

        if (shouldRun) {
          execute(options.run, options.silent, options.customOutput)
        }
      })
    },
  }
}
