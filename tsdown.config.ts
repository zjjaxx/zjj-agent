import { defineConfig } from 'tsdown'

export default defineConfig({
  copy: [
    { from: 'src/public', to: 'dist' },
  ],
  dts: {
    tsgo: true,
  },
  exports: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  sourcemap: true,
})
