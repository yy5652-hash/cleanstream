// Before-and-after pilot. Filled in later in the redesign.
import type { Pack } from '../rules'

export default function Pilot({ pack }: { pack: Pack; packs: Pack[] }) {
  return <h1 className="text-display">{pack.name}</h1>
}
