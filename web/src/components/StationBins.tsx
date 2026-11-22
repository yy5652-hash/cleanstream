import { ArrowDown } from 'lucide-react'
import { t } from '../i18n'
import type { Bin, Pack } from '../rules'
import { physicalBinFor, physicalBinStyle, type StationProfile } from '../station-config'

export function StationDestination({ profile, target, prep }: { profile: StationProfile; target: Bin; prep?: string }) {
  const physical = physicalBinFor(profile, target.id)
  return <>
    <h2 className="my-[3vmin] min-h-[10dvh] text-[18vmin] leading-[0.95] font-semibold tracking-[-0.04em]">{physical?.label || target.name}</h2>
    {physical && <p className="mb-[2vmin] text-[max(0.875rem,2vmin)]">{target.name}</p>}
    <p className="mx-auto max-w-5xl text-[max(1.125rem,3.5vmin)] leading-snug">{physical ? prep : profile.note || t('Not in these bins. {prep}', { prep: prep ?? '' })}</p>
  </>
}

export function StationBins({ pack, profile, target }: { pack: Pack; profile: StationProfile; target: Bin | null }) {
  const physical = target ? physicalBinFor(profile, target.id) : undefined
  return <div aria-label={t('Your bins, left to right')} className="grid gap-1.5 sm:gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(1, profile.bins.length)}, minmax(0, 1fr))` }}>
    {profile.bins.map((bin) => {
      const style = physicalBinStyle(pack, bin)
      const lit = physical?.id === bin.id
      return <div key={bin.id} data-physical-bin={bin.id} data-active={lit} className={`relative flex min-h-[12vmin] min-w-0 items-center justify-center rounded-2xl px-1 py-[3vmin] text-center text-[clamp(0.75rem,2.8vmin,2.5rem)] leading-tight font-semibold ${target && !lit ? 'grayscale' : ''}`} style={{ background: style.color, color: style.ink }}>
        {lit && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl border-[3px] border-current" />}
        {lit && <ArrowDown className="absolute -top-[8vmin] left-1/2 h-[7vmin] w-[7vmin] -translate-x-1/2" strokeWidth={3} aria-label={t('Use this bin')} />}
        {bin.label}
      </div>
    })}
  </div>
}
