import GearList from "@/components/gear-list"
import FetchLogger from "@/components/FetchLogger"

export default function Home() {

  return (
    <main className="container mx-auto py-6">
      <FetchLogger />
      <GearList />
      <section className="mt-8">
        <h2 className="text-2xl font-semibold mb-4">Sensitivity Terms</h2>
        <dl className="space-y-4">
          <div>
            <dt className="font-semibold">DPI (Dots Per Inch)</dt>
            <dd className="ml-4">Your mouse's sensitivity on a hardware level</dd>
          </div>
          <div>
            <dt className="font-semibold">eDPI</dt>
            <dd className="ml-4">
              eDPI = DPI multiplied by ingame sensitivity. Is used to easily compare 'true sensitivities' across different setups in the same game.
            </dd>
          </div>
          <div>
            <dt className="font-semibold">cm/360°</dt>
            <dd className="ml-4">
              Centimeters per 360 degrees is used as a method of measuring mouse sensitivity. This tracks how much physical distance the mouse must travel to turn 360 degrees in-game (not taking into account if you use accel). Given that mouse sensitivity settings can vary from game to game, this can help to maintain settings consistency across multiple games.
            </dd>
          </div>
        </dl>
      </section>
    </main>
  )
}

