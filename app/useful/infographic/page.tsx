import Image from "next/image"

export default function InfographicPage() {
  return (
    <div className="flex flex-col items-center p-4">
      <h1 className="text-3xl font-bold mb-6">Quake Live Infographic Guide</h1>
      <div className="w-full max-w-[2500px] relative">
        <Image
          src="/quake-live-infographic.png"
          width={2500}
          height={29103}
          alt="Quake Live Infographic"
          className="w-full h-auto"
          priority
        />
      </div>
    </div>
  )
}

