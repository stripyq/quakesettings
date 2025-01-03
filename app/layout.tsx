import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Header } from '@/components/header'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'QL Gear & Settings',
  description: 'Quake Live gear and settings',
  openGraph: {
    images: [
      {
        url: '/quakesettings/og',
        width: 1200,
        height: 600,
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Header />
        {children}
      </body>
    </html>
  )
}

