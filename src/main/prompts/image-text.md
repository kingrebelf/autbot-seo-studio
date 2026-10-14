Look at this image. It is used in an article titled "{{title}}" (focus keyword "{{keyword}}"), in the "{{slot}}" position. Article context: {{context}}
Write the text details for the image. Return JSON matching the schema:

- filename: SEO filename, lowercase, hyphenated, ending in .{{ext}}, describing the image (for example spring-lawn-aeration-before-after.{{ext}}).
- alt: describes what is in the image for someone who can't see it, under 125 characters, includes the keyword only if natural.
- title: short title attribute.
- caption: one optional short caption sentence.
- description: two or three sentences for the media library.
