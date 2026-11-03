// Shared pieces: logo, bin icon and chip, sample photos, answer links.
import { useEffect, useState } from 'react'
import type { Bin, Pack } from './rules'

export const pct = (p: number) => `${Math.round(p * 100)}%`

export function Logo() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--c-ink)" />
      <path d="M7 11c3-3 6-3 9 0s6 3 9 0M7 17c3-3 6-3 9 0s6 3 9 0M7 23c3-3 6-3 9 0s6 3 9 0" fill="none" stroke="var(--c-paper)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function Can({ bin, size = 56 }: { bin: Bin; size?: number }) {
  return (
    <svg className="can" viewBox="0 0 56 64" width={size} height={(size * 64) / 56} aria-hidden>
      <rect x="4" y="6" width="48" height="9" rx="3" fill={bin.color} stroke={bin.ink} strokeOpacity=".35" strokeWidth="2" />
      <path d="M9 17h38l-3.5 41a4 4 0 0 1-4 3.7H16.5a4 4 0 0 1-4-3.7z" fill={bin.color} stroke={bin.ink} strokeOpacity=".35" strokeWidth="2" />
      <path d="M22 26v26M28 26v26M34 26v26" stroke={bin.ink} strokeOpacity=".45" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="22" y="1.5" width="12" height="6" rx="2" fill={bin.color} stroke={bin.ink} strokeOpacity=".35" strokeWidth="2" />
    </svg>
  )
}

export function BinChip({ bin }: { bin: Bin }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-sm font-medium leading-none" style={{ background: bin.color, color: bin.ink }}>
      {bin.name}
    </span>
  )
}

export type Sample = { file: string; label: string; source: string }

export function useSamples(): Sample[] {
  const [s, set] = useState<Sample[]>([])
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}samples/samples.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then(set)
      .catch(() => set([]))
  }, [])
  return s
}

export const sampleUrl = (s: Sample) => `${import.meta.env.BASE_URL}samples/${s.file}`
export const thumbUrl = (s: Sample) => `${import.meta.env.BASE_URL}samples/thumbs/${s.file.replace(/\.jpg$/, '.webp')}`

// A link that opens this answer directly: #scan?item=pizza_box&city=sf
export const answerLink = (pack: Pack, item: string) => `${location.origin}${import.meta.env.BASE_URL}#scan?item=${item}&city=${pack.id}`
