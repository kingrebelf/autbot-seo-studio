/** Change this one constant to rename a fork of the app. */
export const APP_NAME = 'Autbot SEO Studio'
export const APP_ID = 'com.autbot.seostudio'
/** GitHub "owner/repo" used for update checks and issue links. */
export const GITHUB_REPO = 'kingrebelf/autbot-seo-studio'
export const DOCS_URL = `https://github.com/${GITHUB_REPO}/tree/main/docs`
export const ISSUES_URL = `https://github.com/${GITHUB_REPO}/issues`

export const userAgent = (version: string): string => `AutbotSEOStudio/${version}`
