import Link from "next/link"
import { MainNav } from "@/components/main-nav"

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-black text-white backdrop-blur supports-[backdrop-filter]:bg-black/60">
      <div className="container flex h-14 items-center">
        <Link href="/" className="mr-4 flex items-center space-x-2">
          <span className="font-bold whitespace-nowrap">QL Gear & Settings</span>
        </Link>
        <MainNav />
      </div>
    </header>
  )
}

