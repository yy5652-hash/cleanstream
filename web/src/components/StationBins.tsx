import { ArrowDown } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { t } from '../i18n'
import type { Bin, Pack } from '../rules'
import { DENSE_BIN_GAP, DENSE_BIN_PADDING, MIN_DENSE_BIN_COUNT, stationBinRows } from '../station-bin-layout'
import { physicalBinFor, physicalBinStyle, type StationProfile } from '../station-config'

export function StationDestination({ profile, target, prep }: { profile: StationProfile; target: Bin; prep?: string }) {
  const physical = physicalBinFor(profile, target.id)
  const titleSize = profile.bins.length >= MIN_DENSE_BIN_COUNT ? 'text-balance text-[clamp(2.5rem,11vmin,7rem)]' : 'text-[18vmin]'
  return <>
    <h2 className={`my-[3vmin] min-h-[10dvh] leading-[0.95] font-semibold tracking-[-0.04em] ${titleSize}`}>{physical?.label || target.name}</h2>
    {/* the city's bin name only when the station renamed or merged it */}
    {physical && physical.label && physical.label !== target.name && <p className="mb-[2vmin] text-[max(0.875rem,2vmin)]">{target.name}</p>}
    <p className="mx-auto max-w-5xl text-[max(1.125rem,3.5vmin)] leading-snug">{physical ? prep : profile.note || t('Not in these bins. {prep}', { prep: prep ?? '' })}</p>
  </>
}

export function StationBins({ pack, profile, target, preview = false }: { pack: Pack; profile: StationProfile; target: Bin | null; preview?: boolean }) {
  const grid = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(Infinity)
  const dense = profile.bins.length >= MIN_DENSE_BIN_COUNT
  useLayoutEffect(() => {
    if (!dense || !grid.current) return
    const element = grid.current
    setWidth(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [dense])

  const physical = target ? physicalBinFor(profile, target.id) : undefined
  const [top = 1, bottom = 0] = stationBinRows(profile.bins.length, width)
  const split = bottom > 0
  const lowerArrow = split && profile.bins.slice(top).some((bin) => bin.id === physical?.id)
  const arrowSpace = 'calc(var(--station-arrow-size) + 0.25rem)'
  // Keep the arrow's space above the row that contains the active bin.
  const layoutStyle = {
    // Two grid tracks per bin let a shorter second row start half a bin in.
    gridTemplateColumns: `repeat(${split ? top * 2 : top}, minmax(0, 1fr))`,
    ...(dense && {
      '--station-arrow-size': 'clamp(1.25rem, 5vmin, 2.25rem)',
      columnGap: DENSE_BIN_GAP,
      paddingTop: physical && !lowerArrow ? arrowSpace : undefined,
      rowGap: lowerArrow ? arrowSpace : DENSE_BIN_GAP,
    }),
  } as CSSProperties
  const gridStyle = dense ? 'auto-rows-fr' : preview ? 'gap-1 overflow-hidden rounded-2xl' : 'gap-1.5 pt-[8vmin] sm:gap-3'
  const cellStyle = dense
    ? 'relative flex min-h-[max(3.25rem,10vmin)] min-w-0 items-center justify-center rounded-2xl py-[1.5vmin] text-center text-[clamp(0.75rem,1.8vmin,1.25rem)] leading-tight font-semibold'
    : preview
      ? 'min-w-0 break-words px-1 py-5 text-center text-sm font-semibold'
      : 'relative flex min-h-[12vmin] min-w-0 items-center justify-center rounded-2xl px-1 py-[3vmin] text-center text-[clamp(0.75rem,2.8vmin,2.5rem)] leading-tight font-semibold'
  return <div ref={grid} aria-label={preview ? undefined : t('Your bins, left to right')} className={`grid ${gridStyle}`} style={layoutStyle}>
    {profile.bins.map((bin, index) => {
      const style = physicalBinStyle(pack, bin)
      const lit = physical?.id === bin.id
      const inactive = target && !lit ? dense ? 'scale-[0.97] grayscale brightness-75' : 'grayscale' : ''
      const columnStart = index < top ? 2 * index + 1 : 2 * (index - top) + 1 + (top - bottom)
      return <div key={bin.id} data-physical-bin={bin.id} data-active={lit} className={`${cellStyle} ${inactive}`} style={{
        background: style.color,
        color: style.ink,
        paddingInline: dense ? DENSE_BIN_PADDING : undefined,
        gridColumn: split ? `${columnStart} / span 2` : undefined,
        gridRow: split ? (index < top ? 1 : 2) : undefined,
      }}>
        {lit && <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl border-[3px] border-current" />}
        {lit && <ArrowDown className={`absolute left-1/2 -translate-x-1/2 ${dense ? 'bottom-[calc(100%+0.25rem)] size-(--station-arrow-size)' : '-top-[8vmin] size-[7vmin]'}`} strokeWidth={3} aria-label={t('Use this bin')} />}
        {dense ? <span className="min-w-0 text-balance [overflow-wrap:anywhere]">{bin.label}</span> : bin.label}
      </div>
    })}
  </div>
}
