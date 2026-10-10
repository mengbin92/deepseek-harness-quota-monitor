import { build } from 'esbuild'

// Bundle the client half into the ModuleLoader registration format the DSH
// web client expects: an IIFE calling window.__ModuleLoader__.load with a CJS
// factory. Platform words (react, cordis) stay external `require()`s,
// resolved at runtime by the client's module-table seed. The Typert Remote
// descriptors (and their zod codecs) are bundled in, mirroring how official
// client bundles ship their remote-client artifacts.
await build({
  entryPoints: ['src/client.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  outfile: 'lib/client.js',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@deepseek-ai/cordis',
  ],
  banner: {
    js: `window.__ModuleLoader__.load({\n\tid: "dsh-client-ui-quota",\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;`,
  },
  footer: {
    js: `\t\treturn module.exports;\n\t}\n});`,
  },
})
console.log('bundled lib/client.js')
