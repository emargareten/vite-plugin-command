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
  onSuccess?: (output?: string) => void
  onError?: () => void
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
      if (error) {
        if (!options.silent) console.error(error.message)
        if (options.onError) options.onError()
      }
      else if (stderr) {
        if (!options.silent) console.error(stderr)
      }
      else if (stdout) {
        if (!options.silent) console.log(stdout)
        if (options.onSuccess) options.onSuccess(stdout)
      }
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
