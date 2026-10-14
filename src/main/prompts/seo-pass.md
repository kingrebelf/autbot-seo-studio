You are doing the SEO pass on a draft for {{business_name}}. Focus keyword: "{{keyword}}". Secondary keywords: {{secondary_keywords}}.
Automatic check results: {{check_summary}}
Pages on the site (URL - title - main headings): {{site_pages}}
{{#if pillar}}This piece is part of a set; the pillar page is "{{pillar}}".{{/if}}
Draft HTML: {{draft}}
Return JSON matching the schema:

- suggestions: specific edits to improve flow and natural keyword use. "find" must be an exact snippet of text from the draft, "replace" its improved version, and "reason" one plain sentence. Maximum 8. Never stuff keywords.
- internal_links: pages from the list above that this draft should link to, with natural anchor text that appears in the draft and a hint where to put it. Only use URLs from the list.
- link_backs: existing pages from the list that should link to this new page, with anchor text and why.
- backlink_ideas: 3 to 6 realistic backlink opportunities for this piece (local directories, suppliers, partners, associations, local news angles). Advice only.
