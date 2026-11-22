import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'
import { clearStationSettings, pinLockSeconds, removeOperatorPin, setOperatorPin, stationResetUrl, useHasOperatorPin, validPin, verifyOperatorPin } from '../operator-pin'
import { Button } from './ui/button'

const field = 'mt-2 min-h-12 w-full rounded-xl border border-line bg-card px-3 text-ink'

export function PinChallenge({ city, onUnlock }: { city: string; onUnlock: () => void }) {
  const [pin, setPin] = useState('')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const [resetting, setResetting] = useState(false)
  useEffect(() => {
    const refresh = () => { try { setSeconds(pinLockSeconds(city)) } catch { setError(t('PIN unavailable. Reset this station’s saved settings to recover.')) } }
    refresh()
    const timer = setInterval(refresh, 250)
    return () => clearInterval(timer)
  }, [city])
  const unlock = async () => {
    if (pending.current || seconds > 0) return
    pending.current = true; setBusy(true); setError('')
    try {
      if (await verifyOperatorPin(city, pin)) { setPin(''); onUnlock() }
      else { setError(t('Incorrect PIN.')); setSeconds(pinLockSeconds(city)); setPin('') }
    } catch { setError(t('PIN unavailable. Reset this station’s saved settings to recover.')) }
    finally { pending.current = false; setBusy(false) }
  }
  return <div className="space-y-4">
    <form onSubmit={(e) => { e.preventDefault(); void unlock() }}>
      <label className="block">{t('Operator PIN')}<input autoFocus className={field} type="password" inputMode="numeric" pattern="[0-9]{4,8}" autoComplete="off" maxLength={8} value={pin} disabled={busy || seconds > 0} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={t('PIN number pad')}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((digit) => <Button type="button" variant="outline" size="lg" key={digit} disabled={busy || seconds > 0 || pin.length >= 8} onClick={() => setPin((value) => (value + digit).slice(0, 8))}>{digit}</Button>)}
        <Button type="button" variant="outline" disabled={busy || seconds > 0} onClick={() => setPin((value) => value.slice(0, -1))}>{t('Delete digit')}</Button>
      </div>
      <p role="status" className="mt-3">{seconds > 0 ? t('Too many tries. Try again in {seconds} seconds.', { seconds }) : error}</p>
      <Button type="submit" className="mt-3 w-full" disabled={!validPin(pin) || busy || seconds > 0}>{t('Unlock settings')}</Button>
    </form>
    <Button variant="ghost" onClick={() => setResetting(!resetting)}>{t('Forgot PIN? Clear saved station settings')}</Button>
    {resetting && <div className="space-y-3 rounded-xl border border-line p-3"><p>{t('This removes this station’s bin profile, PIN, camera and voice settings on this device. Counts are kept. You will need to set up the station again.')}</p><Button variant="outline" onClick={() => {
      try { clearStationSettings(city); location.replace(stationResetUrl(location.href)) }
      catch { setError(t('Could not save PIN settings on this device.')) }
    }}>{t('Clear station settings and reset PIN')}</Button></div>}
  </div>
}

export function PinSettings({ city, authenticated = false }: { city: string; authenticated?: boolean }) {
  const hasPin = useHasOperatorPin(city)
  const [unlocked, setUnlocked] = useState(authenticated)
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  return <section className="mt-6 space-y-3 border-t border-line pt-5">
    <h3 className="font-semibold">{t('Operator PIN (this device only)')}</h3>
    <p className="text-sm text-ink-2">{t('Use 4–8 digits. The PIN is stored only on this device and is never shared in a station link.')}</p>
    {hasPin && !unlocked ? <PinChallenge city={city} onUnlock={() => setUnlocked(true)} /> : <form onSubmit={(e) => {
      e.preventDefault()
      if (!validPin(pin) || pin !== confirmation || busy) return
      setBusy(true); setMessage('')
      void setOperatorPin(city, pin).then(() => { setPin(''); setConfirmation(''); setUnlocked(true); setMessage(t('Operator PIN saved.')) }).catch(() => setMessage(t('Could not save PIN settings on this device.'))).finally(() => setBusy(false))
    }} className="space-y-3">
      <label className="block">{t('New PIN')}<input type="password" inputMode="numeric" autoComplete="new-password" className={field} value={pin} maxLength={8} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></label>
      <label className="block">{t('Confirm PIN')}<input type="password" inputMode="numeric" autoComplete="new-password" className={field} value={confirmation} maxLength={8} onChange={(e) => setConfirmation(e.target.value.replace(/\D/g, ''))} /></label>
      <Button type="submit" disabled={busy || !validPin(pin) || pin !== confirmation}>{t('Save PIN')}</Button>
      {hasPin && <Button type="button" variant="ghost" disabled={busy} onClick={() => { try { removeOperatorPin(city); setMessage(t('Operator PIN removed.')) } catch { setMessage(t('Could not save PIN settings on this device.')) } }}>{t('Remove PIN')}</Button>}
    </form>}
    <p role="status" className="text-sm">{message}</p>
  </section>
}
