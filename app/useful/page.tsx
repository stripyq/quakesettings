import Link from "next/link"
import Image from "next/image"

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
          alt="Quake Live Players Snapshot 2024"
          width={2500} // Provide explicit width for better optimization
          height={1000} // Provide explicit height or determine aspect ratio
          className="w-full h-auto"
          loading="eager"
          priority
        />
      </div>
    </div>
  )
}

