import type { Metadata } from "next"
import { Inter } from 'next/font/google'
import { Header } from "@/components/header"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Quake Live Settings Database",
  description: "A comprehensive database of Quake Live player settings, gear recommendations, and community resources.",
  metadataBase: new URL('https://stripyq.github.io'),
  openGraph: {
    title: "Quake Live Settings Database",
    description: "A comprehensive database of Quake Live player settings, gear recommendations, and community resources.",
    url: 'https://stripyq.github.io/quakesettings',
    siteName: 'Quake Live Settings Database',
    images: [
      {
        url: '/quakesettings/og-image.png', // Make sure to add this image to your public folder
        width: 1200,
        height: 630,
        alt: 'Quake Live Settings Database Preview',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Quake Live Settings Database',
    description: 'A comprehensive database of Quake Live player settings, gear recommendations, and community resources.',
    images: ['/quakesettings/og-image.png'], // Same image as OG
  },
  icons: {
    icon: '/quakesettings/favicon.ico',
    shortcut: '/quakesettings/favicon.ico',
    apple: '/quakesettings/apple-touch-icon.png',
    other: {
      rel: 'apple-touch-icon-precomposed',
      url: '/quakesettings/apple-touch-icon-precomposed.png',
    },
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
        <div className="relative flex min-h-screen flex-col">
          <Header />
          <div className="flex-1">
            {children}
          </div>
        </div>
      </body>
    </html>
  )
}

