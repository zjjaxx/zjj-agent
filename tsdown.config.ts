import { defineConfig } from 'tsdown'

export default defineConfig({
  dts: {
    tsgo: true,
  },
  exports: true,
  banner: {
    js: '#!/usr/bin/env node',
  },
  sourcemap:true,
  // ...config options
})
