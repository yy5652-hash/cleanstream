// A bottom sheet on phones, a centred panel from the small breakpoint up. Built on Radix Dialog for focus and keyboard handling.
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '../i18n'

export function Sheet({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`fixed inset-x-0 bottom-0 z-50 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-ink animate-sheet sm:inset-0 sm:m-auto sm:h-fit sm:w-[30rem] sm:rounded-3xl ${className ?? ''}`}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <Dialog.Title className="text-xl font-semibold tracking-tight">{title}</Dialog.Title>
            <Dialog.Close aria-label={t('Close')} className="grid size-10 place-items-center rounded-full bg-well text-ink hover:bg-line"><X className="size-5" aria-hidden /></Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default Sheet
