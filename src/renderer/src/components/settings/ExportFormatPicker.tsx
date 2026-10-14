import { EXPORT_FORMATS, type ExportFormat } from '@shared/types'
import { cn } from '@/lib/utils'
import { EXPORT_FORMAT_INFO } from './shared'

/** Radio list of export formats with a one-line description each. */
export function ExportFormatPicker({
  value,
  onChange,
  disabled
}: {
  value: ExportFormat
  onChange: (f: ExportFormat) => void
  disabled?: boolean
}) {
  return (
    <div role="radiogroup" aria-label="Export format" className="grid gap-2 md:grid-cols-2">
      {EXPORT_FORMATS.map((f) => (
        <label
          key={f}
          className={cn(
            'flex cursor-pointer gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent/50',
            value === f && 'border-primary bg-primary/5',
            disabled && 'pointer-events-none opacity-60'
          )}
        >
          <input
            type="radio"
            name="export-format"
            className="mt-0.5 accent-[hsl(var(--primary))]"
            checked={value === f}
            onChange={() => onChange(f)}
            disabled={disabled}
          />
          <span>
            <span className="font-medium">{EXPORT_FORMAT_INFO[f].label}</span>
            <span className="block text-muted-foreground">{EXPORT_FORMAT_INFO[f].desc}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

export function isExportFormat(v: string): v is ExportFormat {
  return (EXPORT_FORMATS as readonly string[]).includes(v)
}
