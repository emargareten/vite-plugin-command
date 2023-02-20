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

Once a tracked file changes, the plugin will execute the specified command.

## Plugin options

| name           | type                   | description                                              | default |
|----------------|------------------------|----------------------------------------------------------|---------|
| `pattern`      | `string` or `string[]` | Tracked files paths (minimatch pattern)                  |         |
| `run`          | `string`               | The command to be executed                               |         |
| `silent`       | `boolean`              | Hide the command output in the console                   | `false` |
| `throttle`     | `number`               | Delay before the command can be re-executed              | `500`   |
| `startup`      | `boolean`              | Run the command  when Vite starts                        | `true`  |
| `customOutput` | `string`               | Display a custom output in the console after command ran |         |

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
