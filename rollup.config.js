import typescript from 'rollup-plugin-typescript2'
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default {
  input: 'src/app.ts',
  output: {
    file: 'dist/app.js',
    format: 'esm'
  },
  plugins: [
    nodeResolve(),
    typescript({
      tsconfig: 'tsconfig.json',
      useTsconfigDeclarationDir: true
    })
  ],
  external: [
    '@builderbot/bot',
    '@builderbot/provider-baileys',
    'dotenv',
    'fs',
    'path'
  ]
}