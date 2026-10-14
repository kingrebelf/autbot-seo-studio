import { describe, it, expect } from 'vitest'
import { newer, pickInstaller } from '../../src/main/updates'
import { GITHUB_REPO } from '../../src/shared/constants'

const base = `https://github.com/${GITHUB_REPO}/releases/download/v1.0.1/`
const assets = [
  {
    name: 'autbot-seo-studio-1.0.1-arm64.dmg',
    size: 1,
    browser_download_url: `${base}autbot-seo-studio-1.0.1-arm64.dmg`
  },
  {
    name: 'autbot-seo-studio-1.0.1-setup.exe',
    size: 2,
    browser_download_url: `${base}autbot-seo-studio-1.0.1-setup.exe`
  }
]

describe('updates', () => {
  it('compares versions', () => {
    expect(newer('v1.0.1', '1.0.0')).toBe(true)
    expect(newer('v1.0.0', '1.0.0')).toBe(false)
    expect(newer('v0.9.9', '1.0.0')).toBe(false)
  })

  it('offers the setup .exe on Windows only', () => {
    expect(pickInstaller(assets, 'win32')).toEqual({
      name: assets[1].name,
      size: 2,
      url: assets[1].browser_download_url
    })
    expect(pickInstaller(assets, 'darwin')).toBeNull()
    expect(pickInstaller(assets, 'linux')).toBeNull()
  })

  it('never downloads an installer from anywhere but this repo', () => {
    const evil = [{ name: 'x-setup.exe', size: 1, browser_download_url: 'https://example.com/x-setup.exe' }]
    expect(pickInstaller(evil, 'win32')).toBeNull()
  })
})
