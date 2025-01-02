import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function UsefulPage() {
  return (
    <div className="space-y-12 p-6">
      <section className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Featured Guide</h2>
        <Button asChild className="w-full md:w-auto">
          <Link href="/useful/infographic">
            View Quake Live Infographic Guide
          </Link>
        </Button>
      </section>
      <section>
        <h1 className="text-4xl font-bold mb-6">Community Discord Servers</h1>
        <div className="space-y-2">
          <Link 
            href="https://discord.gg/7xSpGJ5"
            className="text-blue-500 hover:underline block text-lg"
          >
            House of Quake [EU]
          </Link>
          <Link 
            href="https://discord.gg/KYpxv3p"
            className="text-blue-500 hover:underline block text-lg"
          >
            CSQL [EU]
          </Link>
          <Link 
            href="https://discord.gg/GRJUswk"
            className="text-blue-500 hover:underline block text-lg"
          >
            Community Winter CTF [NA]
          </Link>
          <Link 
            href="https://discord.gg/quakectf"
            className="text-blue-500 hover:underline block text-lg"
          >
            quakectf.com (currently freeze tag) [NA]
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-4xl font-bold mb-6">Guides & Support</h2>
        <div className="space-y-2">
          <Link 
            href="https://steamcommunity.com/sharedfiles/filedetails/?id=3145278073"
            className="text-blue-500 hover:underline block text-lg"
          >
            QL CTF 5v5 guide
          </Link>
          <Link 
            href="https://steamcommunity.com/sharedfiles/filedetails/?id=560709175"
            className="text-blue-500 hover:underline block text-lg"
          >
            Quake Live Issues & Errors support F.A.Q By Yakumo
          </Link>
          <Link 
            href="https://www.microsoft.com/en-us/research/project/trueskill-ranking-system/"
            className="text-blue-500 hover:underline block text-lg"
          >
            TrueSkill™ Ranking System explained
          </Link>
          <Link 
            href="/useful/infographic"
            className="text-blue-500 hover:underline block text-lg"
          >
            pickup players snapshot '24 infographic
          </Link>
        </div>
      </section>

      <section>
        <h2 className="text-4xl font-bold mb-6">Rankings & Tools</h2>
        <div className="space-y-2">
          <Link 
            href="http://88.214.20.58/ratings/ctf/"
            className="text-blue-500 hover:underline block text-lg"
          >
            HoQ CTF rankings
          </Link>
          <Link 
            href="http://88.214.20.58/ratings/tdm/"
            className="text-blue-500 hover:underline block text-lg"
          >
            HoQ TDM rankings
          </Link>
          <Link 
            href="https://ql.syncore.org/"
            className="text-blue-500 hover:underline block text-lg"
          >
            web QL server browser
          </Link>
          <Link 
            href="https://www.mouse-sensitivity.com/"
            className="text-blue-500 hover:underline block text-lg"
          >
            cm/360 calculation
          </Link>
          <Link 
            href="https://www.mouse-sensitivity.com/"
            className="text-blue-500 hover:underline block text-lg"
          >
            Mouse Sensitivity Calculator/Converter
          </Link>
          <Link 
            href="https://speed.cloudflare.com"
            className="text-blue-500 hover:underline block text-lg"
          >
            Cloudflare Speed Test
          </Link>
          <Link 
            href="https://packetlosstest.com"
            className="text-blue-500 hover:underline block text-lg"
          >
            Packet Loss Test
          </Link>
          <Link 
            href="https://winmtr.net/download-winmtr"
            className="text-blue-500 hover:underline block text-lg"
          >
            WinMTR - Visual Traceroute Tool
          </Link>
        </div>
      </section>
    </div>
  )
}

