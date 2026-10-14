import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { X, Save } from 'lucide-react'
import { CONTENT_TYPES, type ContentType } from '@shared/types'
import { api } from '@/lib/api'
import { useAction } from '@/hooks/useApi'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Select, Field } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { useEditorCtx } from '../context'
import type { ContentView } from '../types'
import { Counter, Section } from './Section'

interface MetaForm {
  title: string
  seoTitle: string
  metaDescription: string
  slug: string
  focusKeyword: string
  secondaryKeywords: string[]
  categories: string[]
  tags: string[]
  excerpt: string
  type: ContentType
}

const isContentType = (s: string): s is ContentType => (CONTENT_TYPES as readonly string[]).includes(s)

function formOf(c: ContentView): MetaForm {
  return {
    title: c.title ?? '',
    seoTitle: c.seoTitle ?? '',
    metaDescription: c.metaDescription ?? '',
    slug: c.slug ?? '',
    focusKeyword: c.focusKeyword ?? '',
    secondaryKeywords: c.secondaryKeywords ?? [],
    categories: c.categories ?? [],
    tags: c.tags ?? [],
    excerpt: c.excerpt ?? '',
    type: isContentType(c.type) ? c.type : 'blog post'
  }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ChipInput({
  values,
  onChange,
  placeholder
}: {
  values: string[]
  onChange: (v: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const parts = draft
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && !values.includes(s))
    if (parts.length) onChange([...values, ...parts])
    setDraft('')
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add()
    } else if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1))
  }
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1 shadow-sm focus-within:ring-1 focus-within:ring-ring">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
        >
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={() => onChange(values.filter((x) => x !== v))}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        className="min-w-[8rem] flex-1 bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground"
        value={draft}
        placeholder={values.length ? '' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        onBlur={add}
      />
    </div>
  )
}

function SearchPreview({
  siteUrl,
  slug,
  title,
  description
}: {
  siteUrl: string
  slug: string
  title: string
  description: string
}) {
  let host = siteUrl
  try {
    host = new URL(siteUrl).hostname
  } catch {
    /* keep as typed */
  }
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
  return (
    <div
      className="rounded-md border bg-white p-3 font-[arial,sans-serif] text-[#202124] dark:bg-[#202124] dark:text-[#bdc1c6]"
      aria-label="Google search result preview"
    >
      <div className="truncate text-xs">
        {host}
        {slug && <span className="text-[#5f6368] dark:text-[#9aa0a6]"> › {slug}</span>}
      </div>
      <div className="mt-0.5 truncate text-lg leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">
        {cut(title || 'Your SEO title appears here', 60)}
      </div>
      <div className="mt-0.5 line-clamp-2 text-sm text-[#4d5156] dark:text-[#bdc1c6]">
        {cut(
          description ||
            'Your meta description appears here. Write one or two sentences that make people want to click.',
          158
        )}
      </div>
    </div>
  )
}

export function MetaPanel() {
  const { content, site, applyContent } = useEditorCtx()
  const { busy, run } = useAction()
  const initial = useMemo(() => formOf(content), [content])
  const [form, setForm] = useState<MetaForm>(initial)
  const [dirty, setDirty] = useState(false)

  // Take the server's values unless the user has unsaved changes here.
  useEffect(() => {
    if (!dirty) setForm(initial)
  }, [initial, dirty])

  const set = <K extends keyof MetaForm>(k: K, v: MetaForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const save = () =>
    run('save', async () => {
      const r = await api('content.update', {
        id: content.id,
        patch: { ...form, slug: slugify(form.slug) },
        versionNote: 'Edited meta'
      })
      setDirty(false)
      applyContent(r)
      toast({ kind: 'success', title: 'Meta saved' })
    })

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <Field label="Title (H1)">
        <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
      </Field>
      <Field label="SEO title" hint={<Counter n={form.seoTitle.length} min={30} max={60} />}>
        <Input
          value={form.seoTitle}
          onChange={(e) => set('seoTitle', e.target.value)}
          placeholder="Shown as the blue link in Google"
        />
      </Field>
      <Field label="Meta description" hint={<Counter n={form.metaDescription.length} min={120} max={158} />}>
        <Textarea
          rows={3}
          value={form.metaDescription}
          onChange={(e) => set('metaDescription', e.target.value)}
          placeholder="Shown under the link in Google"
        />
      </Field>
      <Section title="Search result preview">
        <SearchPreview
          siteUrl={site?.url ?? ''}
          slug={slugify(form.slug)}
          title={form.seoTitle || form.title}
          description={form.metaDescription}
        />
      </Section>
      <Field label="URL slug" hint="Short, lowercase, words joined by hyphens.">
        <div className="flex gap-2">
          <Input
            value={form.slug}
            onChange={(e) => set('slug', e.target.value)}
            onBlur={() => form.slug && set('slug', slugify(form.slug))}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => set('slug', slugify(form.focusKeyword || form.title))}
          >
            From keyword
          </Button>
        </div>
      </Field>
      <Field label="Focus keyword">
        <Input value={form.focusKeyword} onChange={(e) => set('focusKeyword', e.target.value)} />
      </Field>
      <Field label="Secondary keywords" hint="Press Enter after each one.">
        <ChipInput
          values={form.secondaryKeywords}
          onChange={(v) => set('secondaryKeywords', v)}
          placeholder="Add a keyword"
        />
      </Field>
      <Field label="Categories">
        <ChipInput
          values={form.categories}
          onChange={(v) => set('categories', v)}
          placeholder="Add a category"
        />
      </Field>
      <Field label="Tags">
        <ChipInput values={form.tags} onChange={(v) => set('tags', v)} placeholder="Add a tag" />
      </Field>
      <Field label="Excerpt" hint="A short summary some themes show on blog listings.">
        <Textarea rows={3} value={form.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
      </Field>
      <Field label="Content type">
        <Select
          value={form.type}
          onChange={(e) => isContentType(e.target.value) && set('type', e.target.value)}
        >
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t[0].toUpperCase() + t.slice(1)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="sticky bottom-0 flex items-center gap-2 border-t bg-background py-3">
        <Button type="submit" loading={busy === 'save'} disabled={!dirty}>
          <Save /> Save meta
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setForm(initial)
              setDirty(false)
            }}
          >
            Discard changes
          </Button>
        )}
      </div>
    </form>
  )
}
