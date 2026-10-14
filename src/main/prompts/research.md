Research the topic "{{topic}}" for this business's website.
Data you have: existing pages on the site: {{site_pages}}. Search Console queries (may be empty): {{gsc_queries}}. Keyword data (may be empty): {{keyword_data}}. Competitor results (may be empty): {{serp_results}}. Real search phrases from autocomplete (may be empty): {{autocomplete}}.
{{#if web_search}}Use web search to check what currently ranks and what competitors cover.{{/if}}
Anything else the owner told you: {{notes}}
Return JSON matching the schema. Give 5 to 15 keyword options. For each keyword option give: keyword, intent, difficulty_for_small_site (low/medium/high), volume (number or null), volume_source ("gsc", "dataforseo", or "ai_estimate"), why_it_fits, cannibalization_risk (existing page URL or null).
Never invent search volumes. If you have no data, set volume to null and say "ai_estimate" for any judgment.
For the competitor snapshot, describe who ranks for the leading keyword, the page type, approximate length, what they cover and what they miss. List the URLs you used in sources.
Before recommending, ask yourself: "Is this worth this business's time?" If a keyword isn't worth it, say so in why_it_fits.
Then recommend ONE direction and explain in 2 to 3 plain sentences why, including whether it's worth this business's time at all.
