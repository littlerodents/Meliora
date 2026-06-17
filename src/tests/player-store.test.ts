import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { migrateSettings, usePlayerStore } from '../stores/player'
import type { PlayerSettings, Track } from '../types/music'

const tracks: Track[] = [
  {
    id: '1',
    title: 'One',
    artist: 'A',
    audioUrl: '/1.mp3',
    kind: 'local',
  },
  {
    id: '2',
    title: 'Two',
    artist: 'B',
    audioUrl: '/2.mp3',
    kind: 'local',
  },
  {
    id: '3',
    title: 'Three',
    artist: 'C',
    audioUrl: '/3.mp3',
    kind: 'local',
  },
]

describe('player store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('stops after the final track in sequence mode', () => {
    const store = usePlayerStore()
    store.setTracks(tracks)
    store.settings.playMode = 'sequence'
    store.selectTrack(tracks[2]!, tracks)
    expect(store.nextTrack(false)).toBeNull()
    expect(store.currentTrackId).toBe('3')
  })

  it('loops to the first track in loop mode', () => {
    const store = usePlayerStore()
    store.setTracks(tracks)
    store.settings.playMode = 'loop'
    store.selectTrack(tracks[2]!, tracks)
    expect(store.nextTrack(false)?.id).toBe('1')
  })

  it('keeps the current track in single mode on automatic advance', () => {
    const store = usePlayerStore()
    store.setTracks(tracks)
    store.settings.playMode = 'single'
    store.selectTrack(tracks[1]!, tracks)
    expect(store.nextTrack(false)?.id).toBe('2')
    expect(store.nextTrack(true)?.id).toBe('3')
  })

  it('selects a different track in shuffle mode', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9)
    const store = usePlayerStore()
    store.setTracks(tracks)
    store.settings.playMode = 'shuffle'
    store.selectTrack(tracks[0]!, tracks)
    expect(store.nextTrack(false)?.id).toBe('3')
  })

  it('preserves the active track object when refreshing the library', () => {
    const store = usePlayerStore()
    store.setTracks(tracks)
    store.selectTrack(tracks[1]!, tracks)
    const activeTrack = store.currentTrack

    store.setTracks(tracks.map((track) => ({ ...track })))

    expect(store.currentTrack).toBe(activeTrack)
    expect(store.currentTrackId).toBe('2')
  })
})

describe('player settings migration', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('defaultSettings has settingsVersion 1', () => {
    const result = migrateSettings({})
    expect(result.settingsVersion).toBe(1)
    expect(result.volume).toBe(0.72)
    expect(result.playMode).toBe('loop')
    expect(result.smoothTrackChange).toBe(true)
    expect(result.autoHideChrome).toBe(true)
  })

  it('migrates legacy settings without settingsVersion to version 1 while preserving user preferences', () => {
    const legacy: Partial<PlayerSettings> = {
      volume: 0.3,
      playMode: 'shuffle',
      backgroundBlur: 50,
      lyricFontSize: 24,
    }
    const result = migrateSettings(legacy)

    expect(result.settingsVersion).toBe(1)
    expect(result.volume).toBe(0.3)
    expect(result.playMode).toBe('shuffle')
    expect(result.backgroundBlur).toBe(50)
    expect(result.lyricFontSize).toBe(24)
    expect(result.smoothTrackChange).toBe(true)
    expect(result.autoHideChrome).toBe(true)
  })

  it('keeps settingsVersion when already at current version', () => {
    const result = migrateSettings({ settingsVersion: 1, volume: 0.5 })
    expect(result.settingsVersion).toBe(1)
    expect(result.volume).toBe(0.5)
  })

  it('loadSettings migrates persisted legacy data via the store', () => {
    localStorage.setItem('meliora:settings', JSON.stringify({ volume: 0.4, playMode: 'single' }))
    const store = usePlayerStore()

    expect(store.settings.settingsVersion).toBe(1)
    expect(store.settings.volume).toBe(0.4)
    expect(store.settings.playMode).toBe('single')
    expect(store.settings.autoHideChrome).toBe(true)
  })
})
