"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

export function MainNav() {
  const pathname = usePathname()

  return (
    <nav className="flex items-center space-x-4 lg:space-x-6">
      <Link
        href="/"
        className={cn(
          "text-xs sm:text-sm font-medium transition-colors hover:text-blue-200",
          pathname === "/" && "text-blue-200 underline underline-offset-4"
        )}
      >
        List
      </Link>
      <Link
        href="/useful"
        className={cn(
          "text-xs sm:text-sm font-medium transition-colors hover:text-blue-200",
          pathname === "/useful" && "text-blue-200 underline underline-offset-4"
        )}
      >
        Useful
      </Link>
      <Link
        href="/recommendations"
        className={cn(
          "text-xs sm:text-sm font-medium transition-colors hover:text-blue-200",
          pathname === "/recommendations" && "text-blue-200 underline underline-offset-4"
        )}
      >
        Recommendations
      </Link>
    </nav>
  )
}

