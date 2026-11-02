// Printable bin poster. Filled in later in the redesign.
import type { Pack } from '../rules'

export default function Poster({ pack }: { pack: Pack }) {
  return <h1 className="text-display">{pack.name}</h1>
}
