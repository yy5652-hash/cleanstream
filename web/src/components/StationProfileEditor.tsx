import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { t } from '../i18n'
import type { Pack } from '../rules'
import { mergePhysicalBins, moveBin, profileFromBins, splitPhysicalBin, type StationProfile } from '../station-config'
import { StationBins } from './StationBins'
import { Button } from './ui/button'

const field = 'min-h-11 w-full rounded-xl border border-line bg-card px-3'

export function ProfileApproval({ profile }: { profile: StationProfile }) {
  return <div className="space-y-1 text-sm text-ink-2">
    {profile.approvedBy && <p>{t('Approved by: {name}', { name: profile.approvedBy })}</p>}
    {profile.approvedDate && <p>{t('Approval date: {date}', { date: profile.approvedDate })}</p>}
    {profile.source && <p className="break-words">{t('Profile source: {source}', { source: profile.source })}</p>}
  </div>
}

export function StationProfileEditor({ pack, profile, onChange }: { pack: Pack; profile: StationProfile; onChange: (profile: StationProfile) => void }) {
  const help = useId()
  const list = useRef<HTMLUListElement>(null)
  const drag = useRef<{ id: string; pointer: number } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const ids = profile.bins.map((b) => b.id)
  const move = (id: string, to: number) => {
    const next = moveBin(ids, id, to)
    onChange({ ...profile, bins: next.map((key) => profile.bins.find((b) => b.id === key)!) })
    setAnnouncement(t('{bin} is position {position} of {count}.', { bin: profile.bins.find((b) => b.id === id)!.label, position: next.indexOf(id) + 1, count: next.length }))
  }
  const endDrag = () => { drag.current = null; setDragging(null) }
  const unused = pack.bins.filter((b) => !profile.bins.some((p) => p.streams.includes(b.id)))
  return <div className="min-w-0 space-y-4">
    <p id={help} className="text-ink-2">{t('Name the physical bins at this station. Merge city streams into one bin, or split them back. Drag handles or use arrows to match left-to-right order.')}</p>
    <ul ref={list} className="grid gap-3">
      {profile.bins.map((bin, index) => <li key={bin.id} data-station-bin={bin.id} className={`min-w-0 space-y-3 rounded-2xl border border-line bg-card p-3 ${dragging === bin.id ? 'ring-2 ring-ink' : ''}`}>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="shrink-0 touch-none" aria-label={t('Move {bin}', { bin: bin.label })} aria-describedby={help}
            onKeyDown={(e) => {
              const direction = ['ArrowUp', 'ArrowLeft'].includes(e.key) ? -1 : ['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : 0
              if (direction) { e.preventDefault(); move(bin.id, index + direction) }
            }}
            onPointerDown={(e) => { if (e.button !== 0 || !e.isPrimary) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id: bin.id, pointer: e.pointerId }; setDragging(bin.id) }}
            onPointerMove={(e) => {
              if (drag.current?.pointer !== e.pointerId) return
              const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-station-bin]')
              if (!row || !list.current?.contains(row)) return
              const to = ids.indexOf(row.dataset.stationBin ?? '')
              if (to >= 0 && to !== index) move(bin.id, to)
            }} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
            <GripVertical aria-hidden />
          </Button>
          <label className="min-w-0 flex-1 text-sm">{t('Physical bin label')}<input className={field} value={bin.label} maxLength={80} onChange={(e) => onChange({ ...profile, bins: profile.bins.map((b) => b.id === bin.id ? { ...b, label: e.target.value } : b) })} onBlur={() => { if (!bin.label.trim()) onChange({ ...profile, bins: profile.bins.map((b) => b.id === bin.id ? { ...b, label: pack.bins.find((c) => c.id === b.streams[0])!.name } : b) }) }} /></label>
          <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => move(bin.id, index - 1)} aria-label={t('Move {bin} left', { bin: bin.label })}><ArrowUp aria-hidden /></Button>
          <Button variant="ghost" size="icon" disabled={index === ids.length - 1} onClick={() => move(bin.id, index + 1)} aria-label={t('Move {bin} right', { bin: bin.label })}><ArrowDown aria-hidden /></Button>
        </div>
        <p className="text-sm text-ink-2">{t('City streams: {streams}', { streams: bin.streams.map((id) => pack.bins.find((b) => b.id === id)!.name).join(', ') })}</p>
        <div className="flex flex-wrap items-end gap-2">
          {profile.bins.length > 1 && <label className="min-w-0 flex-1 text-sm">{t('Merge {bin} into', { bin: bin.label })}<select className={field} value="" onChange={(e) => { if (e.target.value) onChange(mergePhysicalBins(profile, bin.id, e.target.value)) }}><option value="">{t('Choose another bin')}</option>{profile.bins.filter((b) => b.id !== bin.id).map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>}
          {bin.streams.length > 1 && <Button variant="outline" onClick={() => onChange(splitPhysicalBin(pack, profile, bin.id))}>{t('Split into city bins')}</Button>}
          <Button variant="ghost" aria-label={t('Remove {bin}', { bin: bin.label })} onClick={() => onChange({ ...profile, bins: profile.bins.filter((b) => b.id !== bin.id) })}>{t('Remove bin')}</Button>
        </div>
      </li>)}
    </ul>
    <p role="status" className="sr-only">{announcement}</p>
    {unused.length > 0 && <label className="block">{t('Add a city bin')}<select className={field} value="" onChange={(e) => { if (e.target.value) onChange({ ...profile, bins: [...profile.bins, ...profileFromBins(pack, [e.target.value]).bins] }) }}><option value="">{t('Choose a stream')}</option>{unused.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
    <p className="text-sm text-ink-2">{t('Your bins, left to right')}</p>
    {profile.bins.length ? <StationBins pack={pack} profile={profile} target={null} preview /> : <p>{t('Choose at least one bin to continue.')}</p>}
    <label className="block text-sm">{t('Note for streams not at this station (optional)')}<textarea className={`${field} py-3`} maxLength={300} value={profile.note ?? ''} onChange={(e) => onChange({ ...profile, note: e.target.value })} /></label>
    <details className="text-sm"><summary className="min-h-11 cursor-pointer py-3">{t('Profile approval (optional)')}</summary><div className="space-y-3">
      <label className="block">{t('Approved by')}<input className={field} maxLength={160} value={profile.approvedBy ?? ''} onChange={(e) => onChange({ ...profile, approvedBy: e.target.value })} /></label>
      <label className="block">{t('Approval date')}<input className={field} type="date" value={profile.approvedDate ?? ''} onChange={(e) => onChange({ ...profile, approvedDate: e.target.value })} /></label>
      <label className="block">{t('Profile source')}<input className={field} maxLength={300} value={profile.source ?? ''} onChange={(e) => onChange({ ...profile, source: e.target.value })} /></label>
    </div></details>
    <ProfileApproval profile={profile} />
  </div>
}
