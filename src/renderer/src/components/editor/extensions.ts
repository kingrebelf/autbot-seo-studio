import { Extension, Node, mergeAttributes, getHTMLFromFragment, type Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

/** Image that keeps `data-image-id` (and its autbot-media:// src) through edits. */
export const ArticleImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      dataImageId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-image-id'),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs.dataImageId ? { 'data-image-id': String(attrs.dataImageId) } : {}
      }
    }
  }
}).configure({ inline: false, allowBase64: false })

/** <figure><img><figcaption></figure>, as the main process writes it. */
export const Figure = Node.create({
  name: 'figure',
  group: 'block',
  content: 'image figcaption?',
  draggable: true,
  isolating: true,
  parseHTML() {
    return [{ tag: 'figure' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes), 0]
  }
})

export const Figcaption = Node.create({
  name: 'figcaption',
  content: 'inline*',
  parseHTML() {
    return [{ tag: 'figcaption' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['figcaption', mergeAttributes(HTMLAttributes), 0]
  }
})

/* ------------------------------------------------ text search across a textblock */

interface TextHit {
  from: number
  to: number
}

/** Walk every textblock, joining its text nodes so a match can span marks (bold etc.). */
function forEachTextblock(doc: PMNode, fn: (text: string, posAt: (offset: number) => number) => void): void {
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true
    let text = ''
    const map: number[] = []
    node.descendants((child, childPos) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) map.push(pos + 1 + childPos + i)
        text += child.text
      }
      return true
    })
    const posAt = (offset: number) => (offset < map.length ? map[offset] : (map[map.length - 1] ?? pos) + 1)
    fn(text, posAt)
    return false
  })
}

const CONFIRM_RE = /\[CONFIRM:[^\]]*\]/gi

export function findConfirms(doc: PMNode): TextHit[] {
  const hits: TextHit[] = []
  forEachTextblock(doc, (text, posAt) => {
    for (const m of text.matchAll(CONFIRM_RE)) {
      const start = m.index ?? 0
      hits.push({ from: posAt(start), to: posAt(start + m[0].length - 1) + 1 })
    }
  })
  return hits
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Find the first place `needle` appears in the document's text (whitespace-insensitive per block). */
export function findText(doc: PMNode, needle: string): TextHit | null {
  const n = norm(needle)
  if (!n) return null
  let hit: TextHit | null = null
  forEachTextblock(doc, (text, posAt) => {
    if (hit) return
    // Collapse whitespace while keeping an index map back to the original text.
    let collapsed = ''
    const idx: number[] = []
    for (let i = 0; i < text.length; i++) {
      const ch = /\s/.test(text[i]) ? ' ' : text[i]
      if (ch === ' ' && collapsed.endsWith(' ')) continue
      collapsed += ch
      idx.push(i)
    }
    const at = collapsed.indexOf(n)
    if (at < 0) return
    hit = { from: posAt(idx[at]), to: posAt(idx[at + n.length - 1]) + 1 }
  })
  return hit
}

/** Highlight [CONFIRM: ...] placeholders. Decorations only; nothing is stored in the HTML. */
export const ConfirmHighlight = Extension.create({
  name: 'confirmHighlight',
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>('confirmHighlight')
    const build = (doc: PMNode) =>
      DecorationSet.create(
        doc,
        findConfirms(doc).map((h) => Decoration.inline(h.from, h.to, { class: 'confirm-mark' }))
      )
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => build(state.doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old)
        },
        props: {
          decorations: (state) => key.getState(state)
        }
      })
    ]
  }
})

/* ------------------------------------------------ outline + sections */

export interface HeadingItem {
  level: number
  text: string
  pos: number
}

export function headingsOf(doc: PMNode): HeadingItem[] {
  const out: HeadingItem[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      out.push({ level: Number(node.attrs.level ?? 2), text: node.textContent, pos })
      return false
    }
    return node.isBlock && !node.isTextblock
  })
  return out
}

/** The section containing `pos`: from its heading to the next heading of the same or higher level. */
export function sectionAt(
  editor: Editor,
  pos: number
): { from: number; to: number; heading: string; html: string } | null {
  const doc = editor.state.doc
  const top: { node: PMNode; pos: number }[] = []
  doc.forEach((node, offset) => top.push({ node, pos: offset }))
  let startIdx = -1
  for (let i = 0; i < top.length; i++) {
    if (top[i].pos > pos) break
    if (top[i].node.type.name === 'heading') startIdx = i
  }
  if (startIdx < 0) return null
  const level = Number(top[startIdx].node.attrs.level ?? 2)
  let endIdx = top.length
  for (let i = startIdx + 1; i < top.length; i++) {
    const n = top[i].node
    if (n.type.name === 'heading' && Number(n.attrs.level ?? 2) <= level) {
      endIdx = i
      break
    }
  }
  const from = top[startIdx].pos
  const to = endIdx < top.length ? top[endIdx].pos : doc.content.size
  const html = getHTMLFromFragment(doc.slice(from, to).content, editor.schema)
  return { from, to, heading: top[startIdx].node.textContent, html }
}

/** "<p>text</p>" -> "text" when replacing an inline selection, so we don't split the paragraph. */
export function unwrapSingleParagraph(html: string): string {
  const m = /^\s*<p>([\s\S]*?)<\/p>\s*$/i.exec(html)
  if (m && !/<p[\s>]/i.test(m[1])) return m[1]
  return html
}
