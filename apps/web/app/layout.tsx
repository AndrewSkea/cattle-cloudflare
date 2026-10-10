import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap', axes: ['opsz'] })

export const metadata: Metadata = {
  title: { default: 'Steading — Farm management', template: '%s · Steading' },
  description: 'Livestock, land, machinery, people and money — one place to run your farm.',
}

export const viewport: Viewport = {
  themeColor: '#275040',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
