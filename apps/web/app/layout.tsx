import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const sans = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap', axes: ['opsz'] })

export const metadata: Metadata = {
  title: { default: 'HoovesWho — Farm management', template: '%s · HoovesWho' },
  description: 'Livestock, land, machinery, people and money — one place to run your farm.',
  applicationName: 'HoovesWho',
  manifest: '/manifest.webmanifest',
  icons: { apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'HoovesWho', statusBarStyle: 'default' },
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
