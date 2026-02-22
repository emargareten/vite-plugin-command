import nodeResolve from "@rollup/plugin-node-resolve";
import tsPlugin from '@rollup/plugin-typescript';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/index.ts',
    output: [
        {
            file: 'dist/vite-plugin-command.umd.cjs',
            format: 'umd',
            name: 'vite-plugin-command',
        },
        {
            file: 'dist/vite-plugin-command.js',
            format: 'es',
        }],
    plugins: [
        nodeResolve(),
        tsPlugin(),
        commonjs(),
    ],
    external: ['minimatch'],
}
