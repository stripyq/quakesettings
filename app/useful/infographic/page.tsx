import Image from "next/image"

export default function InfographicPage() {
  return (
    <div className="flex flex-col items-center p-4 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Quake Live Infographic Guide</h1>
      <div className="relative w-full max-w-4xl">
        <Image
          src="/placeholder.svg?height=4000&width=1000"
          width={1000}
          height={4000}
          alt="Quake Live Infographic"
          className="w-full h-auto"
          priority
        />
      </div>
    </div>
  )
}

