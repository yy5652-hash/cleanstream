import { useEffect } from 'react'
import { syncPilotAudits } from './audit'
import type { Pack } from './rules'
import { useAudits, usePilots } from './store'

export function usePilotRecords(packs: Pack[], pack?: Pack) {
  const [audits, setAudits] = useAudits()
  const [pilots, setPilots] = usePilots(pack)
  useEffect(() => {
    setPilots((pilots) => syncPilotAudits(pilots, audits, packs))
  }, [audits, packs, setPilots])
  return { audits, setAudits, pilots, setPilots }
}
