import * as esbuild from 'esbuild'
import fs from 'node:fs/promises'
import packJSON from '../package.json' with { type: 'json' }

const watch = process.argv.includes('--watch')
const version = packJSON.version
const now = new Date()

const ctx = await esbuild.context({
  entryPoints: ['src/client/slowbutton.js'],
  bundle: true,
  banner: { js: `/* wiki-plugin-slowbutton - ${version} - ${now.toUTCString()} */` },
  minify: !watch,
  sourcemap: true,
  logLevel: 'info',
  outfile: 'client/slowbutton.js',
})

if (watch) {
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await ctx.rebuild()
  await ctx.dispose()
}
