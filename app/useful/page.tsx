import Link from "next/link"

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
        <img
          src="/quakesettings/useful/infographic.png"
          alt="HoQ Infographic"
          className="w-full h-auto"
          loading="lazy"
          key="infographic"
        />
      </div>
    </div>
  )
}

