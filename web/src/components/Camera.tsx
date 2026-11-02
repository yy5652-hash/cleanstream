// Full-window viewfinder. Captures one frame; offers upload when there is no camera or permission was refused.
import * as Dialog from '@radix-ui/react-dialog'
import { ImageUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

export function CameraSheet({ open, onClose, onImage, onUpload, status }: { open: boolean; onClose: () => void; onImage: (b: Blob) => void; onUpload: () => void; status?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    setFailed(false)
    let stream: MediaStream | null = null
    let gone = false
    const start = navigator.mediaDevices?.getUserMedia?.({ video: { facingMode: 'environment', width: { ideal: 1280 } } })
    if (!start) return setFailed(true)
    start.then((s) => {
      if (gone) return s.getTracks().forEach((tr) => tr.stop())
      stream = s
      if (video.current) video.current.srcObject = s
    }).catch(() => setFailed(true))
    return () => {
      gone = true
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [open])

  const snap = () => {
    const v = video.current
    if (!v?.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob((b) => b && (onImage(b), onClose()), 'image/jpeg', 0.92)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Content aria-describedby={undefined} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
          <Dialog.Title className="sr-only">{t('Point your camera')}</Dialog.Title>
          <div className="relative min-h-0 flex-1">
            {failed ? (
              <div className="grid h-full place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <p className="text-2xl font-semibold tracking-tight">{t('No camera available')}</p>
                  <p className="mt-2 text-white/75">{t('Allow camera access in your browser, or upload a photo instead. Photos stay on this device.')}</p>
                </div>
              </div>
            ) : (
              <video ref={video} autoPlay playsInline muted className="absolute inset-0 size-full object-cover" />
            )}
            <Dialog.Close aria-label={t('Close')} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full bg-black/55 text-white"><X className="size-5" aria-hidden /></Dialog.Close>
            {status && <p className="absolute inset-x-0 bottom-4 mx-auto w-fit max-w-[90%] rounded-full bg-black/60 px-4 py-2 text-center text-sm text-white">{status}</p>}
          </div>
          <div className="grid grid-cols-3 items-center px-6 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <button onClick={onUpload} className="flex w-fit items-center gap-2 rounded-full px-1 py-2 text-[15px] text-white"><ImageUp className="size-5" aria-hidden />{t('Upload')}</button>
            {!failed && <button onClick={snap} aria-label={t('Capture')} className="mx-auto size-[4.5rem] rounded-full border-4 border-white p-1 active:scale-95"><span className="block size-full rounded-full bg-white" /></button>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
