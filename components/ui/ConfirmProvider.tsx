'use client'
import { createContext, useContext, useState, useCallback, useRef } from 'react'

interface ConfirmOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(async () => false)

export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((o) => {
    const normalized = typeof o === 'string' ? { message: o } : o
    setOpts(normalized)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  const close = (result: boolean) => {
    resolver.current?.(result)
    resolver.current = null
    setOpts(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => close(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-5 pt-5 pb-4">
              <h3 className="font-semibold text-neutral-900 text-base">
                {opts.title ?? 'Confirmar'}
              </h3>
              <p className="text-sm text-neutral-600 mt-2 leading-relaxed whitespace-pre-line">{opts.message}</p>
            </div>
            <div className="px-5 py-3 bg-neutral-50 border-t border-neutral-100 flex justify-end gap-2">
              {opts.cancelText !== '' && (
                <button
                  onClick={() => close(false)}
                  className="px-4 py-2 text-sm rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                >
                  {opts.cancelText ?? 'Cancelar'}
                </button>
              )}
              <button
                autoFocus
                onClick={() => close(true)}
                className={`px-4 py-2 text-sm rounded-lg font-medium text-white ${
                  opts.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-neutral-900 hover:bg-neutral-700'
                }`}
              >
                {opts.confirmText ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
