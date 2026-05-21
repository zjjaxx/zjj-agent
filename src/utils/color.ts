import { inspect } from 'node:util'
import picocolors from 'picocolors'
import gradient from 'gradient-string'

function formatLogMessage(message: unknown): string {
  if (typeof message === 'string') {
    return message
  }
  return inspect(message, {
    depth: 8,
    maxArrayLength: 50,
    breakLength: 80,
    compact: false,
  })
}

export const errorLog = (message: string) => {
  console.error(picocolors.red(`[ERROR] ${message}`))
}

export const warnLog = (message: string) => {
  console.warn(picocolors.yellow(`[WARN] ${message}`))
}

export const infoLog = (...messages: unknown[]) => {
  const text = messages.map(formatLogMessage).join(" ");
  console.log(picocolors.blue(`[INFO] ${text}`))
}
export const infoLogStream = (...messages: unknown[]) => {
  const text = messages.map(formatLogMessage).join(" ");
  process.stdout.write(picocolors.blueBright(text))
}
export const successLog = (...messages: unknown[]) => {
  console.log(picocolors.green(`[SUCCESS] ${messages.map(formatLogMessage).join(" ")}`))
}

function getDisplayWidth(str: string) {
  let width = 0
  for (const char of str) {
    const code = char.codePointAt(0)!
    // CJK characters and fullwidth forms occupy 2 columns
    width += (code >= 0x1100 && (
      code <= 0x115f || code === 0x2329 || code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f9ff) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
    )) ? 2 : 1
  }
  return width
}

export const gradientBanner = (message: string) => {
  const pad = 2
  const contentWidth = getDisplayWidth(message) + pad * 2
  const top = '╔' + '═'.repeat(contentWidth) + '╗'
  const middle = '║' + ' '.repeat(pad) + message + ' '.repeat(pad) + '║'
  const bottom = '╚' + '═'.repeat(contentWidth) + '╝'
  const bordered = [top, middle, bottom].join('\n')
  console.log(picocolors.bold(gradient.pastel.multiline(bordered)))
}