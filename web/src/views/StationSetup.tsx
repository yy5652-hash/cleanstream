// Three-step station setup. Filled in later in the redesign.
import type { Pack } from '../rules'

export default function StationSetup({ pack }: { pack: Pack; onCity: (id: string) => void }) {
  return <h1 className="text-display">{pack.name}</h1>
}
