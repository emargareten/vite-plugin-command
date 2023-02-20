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

export const command = (config: CommandConfig): PluginOption => {
  const options = {
    silent: false,
    throttle: 500,
    startup: true,
    ...config,
  }

  let throttled = false

  const execute = () => {
    exec(options.run, (error, stdout, stderr) => {
      if (!options.silent) {
        if (error) console.error(error.message)
        if (stderr) console.error(stderr)
        if (stdout) console.log(stdout)
      }
      if (options.customOutput) console.log(options.customOutput)
    })
  }

  return {
    name: "vite-plugin-command",

    buildStart() {
      if (options.startup) {
        execute()
      }
    },

    handleHotUpdate({ file, server }) {
      if (throttled) return

      throttled = true

      setTimeout(() => (throttled = false), options.throttle)

      const patterns = Array.isArray(options.pattern) ? options.pattern : Array.of(options.pattern)

      const shouldRun = patterns.find((pattern) => minimatch(file, path.resolve(server.config.root, pattern)))

      if (shouldRun) {
        execute()
      }
    },
  }
}
