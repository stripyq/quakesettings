import Link from "next/link"
import Image from "next/image"
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'QL Players Snapshot 2024 - Infographic',
  description: 'A comprehensive overview of EU Quake Live player gear preferences and statistics for 2024',
  openGraph: {
    title: 'QL Players Snapshot 2024 - Infographic',
    description: 'A comprehensive overview of Quake Live player gear preferences and statistics for 2024',
    type: 'article',
    images: [
      {
        url: '/quakesettings/useful/infographic/opengraph-image',
        width: 1200,
        height: 600,
      },
    ],
  },
}

export default function InfographicPage() {
  return (
    <div className="flex flex-col items-center p-4">
      <div className="w-full max-w-[1200px] mb-6">
        <Link 
          href="/useful"
          className="text-blue-600 hover:underline inline-block mb-4"
        >
          ← Back to Useful
        </Link>
        <h1 className="text-3xl font-bold mb-6">QL players snapshot 2024</h1>
      </div>
      <div className="w-full max-w-[2500px] relative">
        <Image
          src="/quakesettings/useful/infographic.png"
          alt="Quake Live infographic 2024"
          width={2500}
          height={1406}
          sizes="(max-width: 2500px) 100vw, 2500px"
          className="w-full h-auto"
          priority
          quality={75}
        />
      </div>
    </div>
  )
}

