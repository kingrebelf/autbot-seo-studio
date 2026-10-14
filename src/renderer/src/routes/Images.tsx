import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageIcon, ImageOff, Search, Upload } from 'lucide-react'
import { Page } from '@/components/layout/Layout'
import { Callout, EmptyState, ErrorText, Loading, PageHeader } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { useSite } from '@/lib/app-context'
import { useAction, useApi } from '@/hooks/useApi'
import { ImageDialog, imageSrc, slotLabel, type LibraryImage } from '@/components/images/ImageDialog'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function Images() {
  const site = useSite()
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 250)
  const lib = useApi('images.library', { siteId: site.id, search: q || undefined }, { refreshOnJobs: true })
  const available = useApi('images.available', undefined)
  const content = useApi('content.list', { siteId: site.id })
  const { busy, run } = useAction()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [broken, setBroken] = useState<Set<number>>(new Set())

  const images = useMemo(() => lib.data ?? [], [lib.data])
  const pieces = useMemo(() => content.data ?? [], [content.data])
  const titleOf = useMemo(() => new Map(pieces.map((c) => [c.id, c.title ?? c.topic])), [pieces])
  const selected = images.find((i) => i.id === selectedId) ?? null

  const upload = () =>
    run('upload', async () => {
      const im = await api('images.addOwn', { siteId: site.id, contentId: null, slot: 'library' })
      if (!im) return
      await lib.reload()
      setSelectedId(im.id)
      toast({
        kind: 'success',
        title: 'Image added to your library',
        body: available.data?.vision
          ? 'Text details were written for it. Check them over.'
          : 'Add a file name and alt text so search engines understand it.'
      })
    })

  return (
    <Page wide>
      <PageHeader
        title="Images"
        description="Every image made or uploaded for this site. Click one to edit its text details or use it in another piece."
        actions={
          <Button onClick={() => void upload()} loading={busy === 'upload'}>
            {busy !== 'upload' && <Upload />} Upload my own image
          </Button>
        }
      />

      <div className="space-y-4">
        {available.data && !available.data.generate && (
          <Callout>
            Making new images needs an image-capable AI model (connect one in{' '}
            <Link to="/settings/ai" className="text-primary underline-offset-4 hover:underline">
              Settings &gt; AI Models
            </Link>
            ). Uploading your own photos works without one.
          </Callout>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-80">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search file names, alt text, prompts"
              className="pl-8"
              aria-label="Search images"
            />
          </div>
          {lib.data && (
            <span className="text-sm text-muted-foreground">
              {images.length} image{images.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <ErrorText error={lib.error} />

        {lib.loading && !lib.data ? (
          <Loading label="Loading images…" />
        ) : !images.length ? (
          q ? (
            <EmptyState icon={<Search className="h-8 w-8" />} title="No images match">
              Try a different word, or clear the search to see everything.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<ImageIcon className="h-8 w-8" />}
              title="No images yet"
              action={
                <Button onClick={() => void upload()} loading={busy === 'upload'}>
                  <Upload /> Upload my own image
                </Button>
              }
            >
              Images you make in the content editor or upload here show up in this library, with their file
              names, alt text and the prompt used, ready to reuse.
            </EmptyState>
          )
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {images.map((im: LibraryImage) => {
              const piece = im.contentId ? titleOf.get(im.contentId) : null
              return (
                <button
                  key={im.id}
                  onClick={() => setSelectedId(im.id)}
                  className="group overflow-hidden rounded-lg border bg-card text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    {broken.has(im.id) ? (
                      <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                        <ImageOff className="h-6 w-6" /> File missing
                      </div>
                    ) : (
                      <img
                        src={imageSrc(im.id, im.updatedAt)}
                        alt={im.alt ?? ''}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                        onError={() => setBroken((s) => new Set(s).add(im.id))}
                      />
                    )}
                    <div className="absolute left-2 top-2 flex gap-1">
                      {im.aiGenerated ? (
                        <Badge className="bg-background/90 backdrop-blur">AI-generated</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-background/90 backdrop-blur">
                          Uploaded
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 p-3">
                    <div className="truncate text-sm font-medium" title={im.filename}>
                      {im.filename}
                    </div>
                    <p
                      className={
                        im.alt ? 'line-clamp-2 text-xs text-muted-foreground' : 'text-xs italic text-warning'
                      }
                    >
                      {im.alt || 'No alt text yet'}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-[11px] text-muted-foreground">
                      {im.width && im.height && (
                        <span>
                          {im.width} × {im.height}
                        </span>
                      )}
                      <span>{slotLabel(im.slot)}</span>
                      {im.aiGenerated && im.modelId && (
                        <span className="truncate" title={im.prompt ?? undefined}>
                          {im.modelId}
                        </span>
                      )}
                    </div>
                    {im.aiGenerated && im.prompt && (
                      <p className="line-clamp-2 text-[11px] text-muted-foreground" title={im.prompt}>
                        Prompt: {im.prompt}
                      </p>
                    )}
                    {piece && <div className="truncate text-xs text-primary">In: {piece}</div>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <ImageDialog
        image={selected}
        content={pieces}
        canDescribe={Boolean(available.data?.vision)}
        onClose={() => setSelectedId(null)}
        onChanged={() => {
          void lib.reload()
          void content.reload()
        }}
      />
    </Page>
  )
}
