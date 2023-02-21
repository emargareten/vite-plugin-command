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

## Plugin options

| name           | type                             | description                                                                                           | default |
|----------------|----------------------------------|-------------------------------------------------------------------------------------------------------|---------|
| `pattern`      | `string` or `string[]`           | Tracked files paths (minimatch pattern)                                                               |         |
| `run`          | `string`                         | The command to be executed                                                                            |         |
| `silent`       | `boolean`                        | Hide the command output in the console                                                                | `false` |
| `throttle`     | `number`                         | Delay before the command can be re-executed                                                           | `500`   |
| `startup`      | `boolean`                        | Run the command  when Vite starts                                                                     | `true`  |
| `customOutput` | `string` or `(output) => string` | Display a custom output in the console after command ran (when set the command output will be hidden) |         |

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
