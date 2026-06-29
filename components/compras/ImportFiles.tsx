'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface ImportFile {
  id: number
  file_name: string
  file_type: string | null
  file_size_kb: number
  uploaded_at: string
  uploaded_by: string | null
  visible_to_user?: boolean
}

interface Props {
  orderId: number
  canEdit?: boolean
  onChange: () => void
}

const isImage = (t?: string | null) => !!t && t.startsWith('image/')

export default function ImportFiles({ orderId, canEdit = true, onChange }: Props) {
  const confirm = useConfirm()
  const [files,   setFiles]   = useState<ImportFile[]>([])
  const [busy,    setBusy]    = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [preview, setPreview] = useState<ImportFile | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const zoneRef  = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/imports/${orderId}/files`)
    if (res.ok) setFiles(await res.json())
  }, [orderId])
  useEffect(() => { load() }, [load])

  const uploadMany = useCallback(async (list: File[]) => {
    if (!list.length) return
    setBusy(true); setError(null)
    const errors: string[] = []
    for (let i = 0; i < list.length; i++) {
      const file = list[i]
      setProgress({ done: i, total: list.length, name: file.name })
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/imports/${orderId}/files`, { method: 'POST', body: fd })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        errors.push(`${file.name}: ${e.error ?? 'Error'}`)
      }
    }
    setProgress(null)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
    if (errors.length) setError(errors.join(' · '))
    await load()
    onChange()
  }, [orderId, load, onChange])

  // Admin: marca/desmarca una foto como visible para el usuario normal.
  // La API recibe el set completo de ids visibles, así que lo recalculamos.
  const toggleVisible = async (fileId: number) => {
    const next = new Set(files.filter(f => f.visible_to_user).map(f => f.id))
    if (next.has(fileId)) next.delete(fileId); else next.add(fileId)
    // Optimista: refleja el cambio al instante
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, visible_to_user: next.has(fileId) } : f))
    const res = await fetch(`/api/imports/${orderId}/files/visibility`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible_ids: [...next] }),
    })
    if (!res.ok) { setError('No se pudo cambiar la visibilidad'); await load() }
  }

  const remove = async (fileId: number) => {
    if (!await confirm({ title: 'Eliminar archivo', message: '¿Eliminar este archivo?', confirmText: 'Eliminar', danger: true })) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/imports/${orderId}/files/${fileId}`, { method: 'DELETE' })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      setError(e.error ?? 'Error')
      return
    }
    await load()
    onChange()
  }

  // Ctrl+V paste handler — only active while this panel is mounted
  useEffect(() => {
    if (!canEdit) return
    const handler = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? [])
      const imgs  = items.filter(i => i.type.startsWith('image/'))
      if (!imgs.length) return
      // Skip if focus is in an input/textarea (let normal paste happen)
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      e.preventDefault()
      const fs: File[] = []
      for (const it of imgs) {
        const blob = it.getAsFile()
        if (!blob) continue
        const ext = it.type === 'image/png' ? 'png'
                  : it.type === 'image/gif' ? 'gif'
                  : it.type === 'image/webp' ? 'webp' : 'jpg'
        fs.push(new File([blob], `paste_${Date.now()}.${ext}`, { type: it.type }))
      }
      if (fs.length) uploadMany(fs)
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
  }, [canEdit, uploadMany])

  // Esc closes lightbox
  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [preview])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (!canEdit) return
    const list = Array.from(e.dataTransfer.files ?? [])
    if (list.length) uploadMany(list)
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-neutral-500">
          Archivos / Fotos ({files.length})
          {canEdit && (
            <span className="ml-2 text-[10px] text-neutral-400">👁 = visible al usuario normal</span>
          )}
        </div>
        {canEdit && (
          <label className="btn-secondary text-sm cursor-pointer">
            {busy ? 'Subiendo…' : '+ Archivo'}
            <input ref={inputRef} type="file" className="hidden"
              disabled={busy}
              multiple
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.xlsx,.xls,.doc,.docx"
              onChange={e => {
                const list = Array.from(e.target.files ?? [])
                if (list.length) uploadMany(list)
              }} />
          </label>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-1 rounded text-xs mb-2">
          {error}
        </div>
      )}

      {canEdit && (
        <div
          ref={zoneRef}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition mb-3 ${
            dragOver ? 'border-neutral-800 bg-neutral-100' : 'border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50'
          }`}
        >
          <p className="text-xs text-neutral-600 font-medium">
            📁 Clic · Arrastrar · <kbd className="bg-white px-1.5 py-0.5 rounded border text-[10px]">Ctrl+V</kbd>
          </p>
          <p className="text-[10px] text-neutral-400 mt-0.5">JPG, PNG, PDF, Excel, Word — Máx. 10 MB</p>
        </div>
      )}

      {progress && (
        <div className="mb-3">
          <div className="w-full bg-neutral-200 rounded-full h-1.5">
            <div className="bg-neutral-800 h-1.5 rounded-full transition-all"
              style={{ width: `${((progress.done) / progress.total) * 100}%` }} />
          </div>
          <p className="text-[11px] text-neutral-500 mt-1 truncate">
            Subiendo {progress.done + 1}/{progress.total}: {progress.name}
          </p>
        </div>
      )}

      {files.length === 0 ? (
        <div className="text-neutral-400 text-xs py-3 text-center">Sin archivos</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {files.map(f => {
            const src = `/api/imports/${orderId}/files/${f.id}/download`
            return (
              <div key={f.id}
                className="relative group rounded-lg overflow-hidden bg-neutral-50 aspect-square border border-neutral-200">
                {isImage(f.file_type) ? (
                  <img
                    src={src}
                    alt={f.file_name}
                    loading="lazy"
                    onClick={() => setPreview(f)}
                    className="w-full h-full object-cover cursor-zoom-in"
                  />
                ) : (
                  <a href={`${src}?download=1`}
                    target="_blank" rel="noopener noreferrer"
                    className="w-full h-full flex flex-col items-center justify-center p-2 hover:bg-neutral-100">
                    <span className="text-2xl">📄</span>
                    <p className="text-[10px] text-neutral-600 text-center truncate w-full mt-1">{f.file_name}</p>
                  </a>
                )}
                {canEdit && (
                  <button onClick={() => remove(f.id)} disabled={busy}
                    title="Eliminar"
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs font-bold opacity-0 group-hover:opacity-100 transition flex items-center justify-center hover:bg-red-600">
                    ✕
                  </button>
                )}
                {canEdit && (
                  <button onClick={() => toggleVisible(f.id)} disabled={busy}
                    title={f.visible_to_user ? 'Visible para el usuario — clic para ocultar' : 'Oculta al usuario — clic para mostrar'}
                    className={`absolute top-1 left-1 rounded-full w-5 h-5 text-[11px] font-bold transition flex items-center justify-center ${
                      f.visible_to_user
                        ? 'bg-green-600 text-white opacity-100'
                        : 'bg-black/50 text-white opacity-0 group-hover:opacity-100'
                    }`}>
                    {f.visible_to_user ? '👁' : '🚫'}
                  </button>
                )}
                {isImage(f.file_type) && (
                  <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition pointer-events-none">
                    {f.file_name}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {preview && isImage(preview.file_type) && (
        <div
          onClick={() => setPreview(null)}
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 cursor-zoom-out"
        >
          <button onClick={(e) => { e.stopPropagation(); setPreview(null) }}
            className="absolute top-4 right-4 bg-white text-black rounded-full w-9 h-9 text-lg font-bold flex items-center justify-center hover:bg-neutral-200 z-10">
            ✕
          </button>
          <div onClick={e => e.stopPropagation()} className="max-w-5xl max-h-full flex flex-col items-center">
            <img
              src={`/api/imports/${orderId}/files/${preview.id}/download`}
              alt={preview.file_name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <p className="text-white text-xs mt-3 truncate max-w-full">{preview.file_name}</p>
            <a href={`/api/imports/${orderId}/files/${preview.id}/download?download=1`}
              className="text-neutral-300 hover:text-white text-xs mt-1 underline">
              Descargar original
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
