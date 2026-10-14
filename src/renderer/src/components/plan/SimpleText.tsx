import { Fragment, type ReactNode } from 'react'

/** Render **bold** inside a line without using innerHTML. */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    )
}

/**
 * Light formatting for AI chat replies: paragraphs, headings (#), bullet and numbered lists, bold.
 * Everything is rendered as React text, so nothing in the reply can run as HTML.
 */
export function SimpleText({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/)
  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '')
        if (!lines.length) return null
        if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
          const ordered = /^\s*\d+[.)]\s+/.test(lines[0])
          const items = lines.map((l, i) => (
            <li key={i}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>
          ))
          return ordered ? (
            <ol key={bi} className="list-decimal space-y-1 pl-5">
              {items}
            </ol>
          ) : (
            <ul key={bi} className="list-disc space-y-1 pl-5">
              {items}
            </ul>
          )
        }
        return (
          <div key={bi}>
            {lines.map((l, li) => {
              const h = l.match(/^#{1,6}\s+(.*)$/)
              if (h)
                return (
                  <div key={li} className="font-semibold">
                    {inline(h[1])}
                  </div>
                )
              const bullet = l.match(/^\s*(?:[-*•]|(\d+[.)]))\s+(.*)$/)
              if (bullet)
                return (
                  <p key={li} className="mt-1 pl-5 -indent-4">
                    {bullet[1] ? `${bullet[1]} ` : '• '}
                    {inline(bullet[2])}
                  </p>
                )
              return (
                <p key={li} className={li > 0 ? 'mt-1' : undefined}>
                  {inline(l)}
                </p>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
