# Vite Command Runner

A Vite plugin that runs custom shell commands on file changes.

## Installation

You can install the package via `npm`:

```bash
npm i -D vite-plugin-command
```

## Usage

Import the package from `vite.config.js` and configure it.

```js
import { defineConfig } from "vite"
import { command } from "vite-plugin-command"

export default defineConfig({
  plugins: [ 
    command({
      pattern: "routes/**/*.php",
      run: "php artisan ziggy:generate",
    }),
  ],
})
```

You can also run multiple commands by passing an array of objects.

```js
export default defineConfig({
  plugins: [ 
    command([
      {
        pattern: "routes/**/*.php",
        run: "php artisan ziggy:generate",
      },
      {
        pattern: "app/{Data,Enums}/**/*.php",
        run: "php artisan typescript:transform",
      },
    ]),
  ],
})
```

Once a tracked file changes, the plugin will execute the specified command.

Startup commands run concurrently, and Vite waits for all enabled startup commands to finish before bundling or serving modules. If commands depend on one another, combine them in a single `run` string with `&&`.

Matching hot-update commands also run concurrently, and HMR waits for them to finish before reloading affected modules. Slow commands therefore delay hot updates.

A command never runs twice at the same time. If it is triggered again while still running, one follow-up run is queued after the current one finishes, and further triggers share that queued run. After a hot-update run starts, the command will not start again for `throttle` milliseconds; changes during that window queue the same single follow-up run for when it ends, so the latest change is never skipped. A hot update that arrives mid-run therefore waits for both the current and the follow-up run, and one that arrives during the `throttle` window waits for the rest of that window plus a run.

Set `wait: false` on a command to run it in the background instead, so Vite continues startup or HMR without waiting for it. This suits commands whose output Vite does not import, such as linters or notifications. Background commands never reject Vite's hooks, so `failOnError` has no effect when `wait` is `false`; failures are still logged unless `silent` is enabled.

Command failures are logged and remain non-fatal by default. Set `failOnError: true` on a command to reject Vite's startup or hot-update hook when it fails. Exceptions thrown by a `customOutput` function follow the same policy. `silent` suppresses raw command output and plugin error logs; Vite may still report a rejected hook when `failOnError` is enabled.

`customOutput` runs only after a command succeeds and is displayed even when `silent` is enabled. Failed commands report their original output unless `silent` is enabled.

Command output is buffered up to 10 MB; a command that prints more is treated as failed.

## Upgrading from 2.x

- Commands are now awaited: Vite waits for startup commands before bundling and for hot-update commands before HMR. This includes every rebuild in `vite build --watch`, since `buildStart` runs on each one. Set `wait: false` on a command to restore the 2.x fire-and-forget behavior.
- `throttle` no longer drops changes: a change during the throttle window or an active run triggers one trailing run instead of being ignored.
- Failed commands now show their stdout, and `customOutput` is only displayed after a successful run.

## Plugin options

| name           | type                             | description                                                                                            | default |
|----------------|----------------------------------|--------------------------------------------------------------------------------------------------------|---------|
| `pattern`      | `string` or `string[]`           | Tracked files paths (minimatch pattern)                                                                |         |
| `run`          | `string`                         | The command to be executed                                                                             |         |
| `silent`       | `boolean`                        | Hide the command output in the console                                                                 | `false` |
| `throttle`     | `number`                         | Minimum delay between hot-update runs (in milliseconds); changes in between trigger one trailing run    | `500`   |
| `startup`      | `boolean`                        | Run the command  when Vite starts                                                                      | `true`  |
| `failOnError`  | `boolean`                        | Reject Vite's startup or hot-update hook when the command fails (requires `wait`)                      | `false` |
| `wait`         | `boolean`                        | Wait for the command to finish before Vite continues startup or HMR                                    | `true`  |
| `customOutput` | `string` or `(output) => string` | Display a custom output in the console after command ran (when set, the command output will be hidden) |         |

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
