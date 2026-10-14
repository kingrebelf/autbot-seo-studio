import { useState } from 'react'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { TONES, type BusinessProfile } from '@shared/types'
import { ListInput } from './shared'

const COUNTRIES: [string, string][] = [
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['NZ', 'New Zealand'],
  ['IE', 'Ireland'],
  ['ZA', 'South Africa'],
  ['IN', 'India'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['ES', 'Spain'],
  ['IT', 'Italy'],
  ['NL', 'Netherlands'],
  ['SE', 'Sweden'],
  ['BR', 'Brazil'],
  ['MX', 'Mexico'],
  ['JP', 'Japan'],
  ['SG', 'Singapore'],
  ['AE', 'United Arab Emirates']
]

const LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Dutch',
  'Swedish',
  'Japanese'
]

/** Trim text and drop empty list rows before saving. */
export function cleanProfile(p: BusinessProfile): BusinessProfile {
  const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean)
  return {
    ...p,
    name: p.name.trim(),
    url: p.url.trim(),
    whatYouSell: p.whatYouSell.trim(),
    serviceArea: p.serviceArea.trim(),
    customerType: p.customerType.trim(),
    topServices: list(p.topServices),
    competitors: list(p.competitors),
    tone: p.tone.trim() || 'Friendly',
    language: p.language.trim() || 'English',
    country: p.country.trim() || 'US',
    mustNotSay: p.mustNotSay.trim(),
    callToAction: p.callToAction?.trim() ?? '',
    facts: p.facts?.trim() ?? ''
  }
}

/** Returns a plain-English problem with the profile, or null when it can be saved. */
export function profileProblem(p: BusinessProfile): string | null {
  const c = cleanProfile(p)
  if (!c.name) return 'Enter your business name.'
  if (c.url.length < 3 || !c.url.includes('.')) return 'Enter your website address, like www.example.com.'
  if (c.topServices.length > 5) return 'List at most 5 top services. Keep the ones that make the most money.'
  return null
}

export function BusinessProfileForm({
  value,
  onChange,
  showExtras = false
}: {
  value: BusinessProfile
  onChange: (p: BusinessProfile) => void
  /** Show the call-to-action and facts fields (Settings only). */
  showExtras?: boolean
}) {
  const set = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) => onChange({ ...value, [k]: v })
  const isPreset = (TONES as readonly string[]).includes(value.tone)
  const [custom, setCustom] = useState(!isPreset)
  const knownCountry = COUNTRIES.some(([c]) => c === value.country)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Business name">
        <Input
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Smith Plumbing"
        />
      </Field>
      <Field label="Website address">
        <Input
          value={value.url}
          onChange={(e) => set('url', e.target.value)}
          placeholder="https://www.example.com"
        />
      </Field>
      <Field label="What you sell" className="md:col-span-2" hint="A sentence or two, in your own words.">
        <Textarea
          value={value.whatYouSell}
          onChange={(e) => set('whatYouSell', e.target.value)}
          placeholder="Emergency plumbing, water heater installs and bathroom remodels for homeowners."
        />
      </Field>
      <Field label="Service area" hint='A city or region, or "online / nationwide".'>
        <Input
          value={value.serviceArea}
          onChange={(e) => set('serviceArea', e.target.value)}
          placeholder="Austin, Texas"
        />
      </Field>
      <Field label="Main customer type">
        <Input
          value={value.customerType}
          onChange={(e) => set('customerType', e.target.value)}
          placeholder="Homeowners aged 35–65"
        />
      </Field>
      <Field
        label="Top 3 to 5 products or services"
        hint="The ones that make you the most money."
        className="md:col-span-2"
      >
        <ListInput
          values={value.topServices}
          onChange={(v) => set('topServices', v)}
          min={3}
          max={5}
          placeholder="e.g. Water heater installation"
          addLabel="Add a service"
        />
      </Field>
      <Field label="Competitors (optional)" hint="Names or website addresses." className="md:col-span-2">
        <ListInput
          values={value.competitors}
          onChange={(v) => set('competitors', v)}
          max={10}
          placeholder="e.g. rivalplumbing.com"
          addLabel="Add a competitor"
        />
      </Field>
      <Field label="Tone of voice">
        <Select
          value={custom ? '__custom' : value.tone}
          onChange={(e) => {
            if (e.target.value === '__custom') {
              setCustom(true)
              set('tone', '')
            } else {
              setCustom(false)
              set('tone', e.target.value)
            }
          }}
        >
          {TONES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value="__custom">Custom…</option>
        </Select>
        {custom && (
          <Input
            className="mt-2"
            value={value.tone}
            onChange={(e) => set('tone', e.target.value)}
            placeholder="Describe your tone, e.g. warm, a bit cheeky, no jargon"
          />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Language">
          <Select value={value.language} onChange={(e) => set('language', e.target.value)}>
            {!LANGUAGES.includes(value.language) && <option value={value.language}>{value.language}</option>}
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country">
          <Select value={value.country} onChange={(e) => set('country', e.target.value)}>
            {!knownCountry && <option value={value.country}>{value.country}</option>}
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field
        label="Things the AI must never say or promise"
        className="md:col-span-2"
        hint="For example: prices, guarantees, legal or medical claims."
      >
        <Textarea
          value={value.mustNotSay}
          onChange={(e) => set('mustNotSay', e.target.value)}
          placeholder="Never promise same-day service. Never quote prices."
        />
      </Field>
      {showExtras && (
        <>
          <Field label="Call to action" hint="What readers should do next.">
            <Input
              value={value.callToAction ?? ''}
              onChange={(e) => set('callToAction', e.target.value)}
              placeholder="Call us at 555-0100 for a free quote"
            />
          </Field>
          <Field
            label="Facts about your business"
            hint="Years in business, awards, licenses. The AI may use these."
          >
            <Textarea value={value.facts ?? ''} onChange={(e) => set('facts', e.target.value)} />
          </Field>
        </>
      )}
    </div>
  )
}
