/** Spec 5.1, shown verbatim with its date. Update the date and rows when provider rules change. */
const ROWS: { provider: string; answer: string; rest: string; how: React.ReactNode }[] = [
  {
    provider: 'ChatGPT (OpenAI)',
    answer: 'Yes',
    rest: ', for eligible Plus and Pro plans, through OpenAI’s official “Sign in with ChatGPT” for open-source apps. Usage counts against the plan’s limits.',
    how: (
      <>
        &ldquo;Sign in with ChatGPT&rdquo; button, <strong>or</strong> an OpenAI API key
      </>
    )
  },
  {
    provider: 'Claude (Anthropic)',
    answer: 'No.',
    rest: ' Anthropic’s terms only allow Free/Pro/Max logins inside Claude’s own apps and Claude Code. Using them in other apps breaks their terms.',
    how: 'Anthropic API key (pay-as-you-go from the Claude Console)'
  },
  {
    provider: 'Gemini (Google)',
    answer: 'No.',
    rest: ' Google says using Gemini CLI / Google AI Pro logins in third-party software violates its terms.',
    how: 'Gemini API key from Google AI Studio (has a free tier)'
  },
  {
    provider: 'Grok (xAI)',
    answer: 'Not supported in this app yet.',
    rest: ' Some partner apps offer SuperGrok sign-in, but xAI hasn’t published it as an open program for any developer.',
    how: 'xAI API key'
  },
  {
    provider: 'Muse Spark (Meta)',
    answer: 'No subscription link.',
    rest: ' Meta offers Muse Spark through its Meta Model API (developer preview, US accounts at launch).',
    how: 'Meta Model API key'
  },
  {
    provider: 'Local models',
    answer: '',
    rest: 'Free, private, runs on your computer.',
    how: 'Ollama or LM Studio (no key)'
  },
  {
    provider: 'OpenRouter',
    answer: '',
    rest: 'One key, hundreds of models from all the companies above.',
    how: 'OpenRouter API key'
  }
]

export function SubscriptionsTable() {
  return (
    <section data-testid="about-subscriptions" className="space-y-2">
      <h3 className="font-semibold">About subscriptions</h3>
      <p className="text-sm text-muted-foreground">
        Consumer chat subscriptions are not all usable by outside apps. As of October 2026:
      </p>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Provider</th>
              <th className="p-2 font-medium">Use your chat subscription in this app?</th>
              <th className="p-2 font-medium">How this app connects</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.provider} className="border-t align-top">
                <td className="p-2 font-semibold">{r.provider}</td>
                <td className="p-2">
                  {r.answer && <strong>{r.answer}</strong>}
                  {r.rest}
                </td>
                <td className="p-2">{r.how}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Provider rules change. This app only uses official API keys and official sign-in programs. It never
        copies logins from other apps.
      </p>
    </section>
  )
}
