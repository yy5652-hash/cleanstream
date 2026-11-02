// For sites: what a campus or office can set up. Filled in later in the redesign.
import type { Pack } from '../rules'

export default function Sites({ pack }: { pack: Pack }) {
  return <h1 className="text-display">{pack.name}</h1>
}
