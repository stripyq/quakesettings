import Link from 'next/link'

export default function RecommendationsPage() {
  return (
    <main className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-2">Gear Recommendations</h1>
      <p className="text-gray-600 mb-6">Various reviewers recommendations for gaming pc peripherals at the end of 2024. You DONT need this, but it's nice:)</p>
      
      <nav className="space-y-4">
        <Link href="/recommendations/mice" className="block text-xl font-semibold text-blue-600 hover:underline">
          Gaming Mice
        </Link>
        <Link href="/recommendations/mousepads" className="block text-xl font-semibold text-blue-600 hover:underline">
          Mousepads
        </Link>
        <Link href="/recommendations/keyboards" className="block text-xl font-semibold text-blue-600 hover:underline">
          Keyboards
        </Link>
        <Link href="/recommendations/monitors" className="block text-xl font-semibold text-blue-600 hover:underline">
          Monitors
        </Link>
        <Link href="/recommendations/headsets" className="block text-xl font-semibold text-blue-600 hover:underline">
          Headsets
        </Link>
      </nav>
    </main>
  )
}

