Write image-generation prompts for a {{content_type}} titled "{{title}}" (focus keyword "{{keyword}}").
Slots needed: {{slots}}
Style: {{style}}. {{#if brand_colors}}Brand colors: {{brand_colors}}.{{/if}}
Avoid: {{avoid}}
Article summary: {{summary}}
Each prompt should describe one clear, specific scene that helps a reader understand the section it goes with. The featured image should work as a social sharing image.
Return JSON matching the schema with one entry per slot, using the slot names given.
