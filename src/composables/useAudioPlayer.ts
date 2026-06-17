import { onBeforeUnmount, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import type { Track } from '../types/music'
import { useBeatAnalyser } from './useBeatAnalyser'
import {
  usePreloadPool,
  preloadCover,
  preloadLyrics,
  type PreloadDirection,
  type PreloadSlot,
} from './usePreloadPool'

const CROSSFADE_DURATION = 650
const FADE_OUT_DURATION = 180
const FADE_IN_DURATION = 360

function createAudio(preload: HTMLMediaElement['preload']) {
  const audio = new Audio()
  audio.preload = preload
  audio.crossOrigin = 'anonymous'
  return audio
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function useAudioPlayer() {
  const store = usePlayerStore()
  const { currentTrack, isPlaying, currentTime, duration, settings } = storeToRefs(store)
  const players = [createAudio('metadata'), createAudio('auto'), createAudio('auto')] as const
  let activeAudio = players[0]
  let transitionInProgress = false
  let automaticCrossfadeStarted = false
  let volumeAnimation = 0
  let switchRequestId = 0
  // 当 active audio 还没有有效 duration 时，记录用户请求的 seek 时间，
  // 等到 durationchange / loadedmetadata 后再真正写入 audio.currentTime。
  let pendingSeekTime: number | null = null

  const { beatLevel, spectrumLevels, startBeatAnalysis, stopBeatAnalysis } = useBeatAnalyser({
    players,
    getActiveAudio: () => activeAudio,
    isPlaying,
  })

  const {
    preloadSlots,
    preloadMessage,
    failedTrackIds,
    predictNextTrack,
    clearPreloads,
    clearSlot,
    findSlotByTrack,
    slotCanStart,
    loadSlot,
    scheduleAdjacentPreload,
  } = usePreloadPool({
    players,
    store,
    settings,
    getActiveAudio: () => activeAudio,
    transitionInProgress: () => transitionInProgress,
  })

  function setPlayerVolume(audio: HTMLAudioElement, gain: number) {
    audio.volume = Math.max(0, Math.min(1, settings.value.volume * gain))
  }

  function audioGain(audio: HTMLAudioElement) {
    return settings.value.volume > 0 ? clamp(audio.volume / settings.value.volume, 0, 1) : 1
  }

  function animateGain(updaters: Array<(eased: number) => void>, duration: number): Promise<void> {
    const animationId = ++volumeAnimation
    const startedAt = performance.now()
    return new Promise<void>((resolve) => {
      function applyAll(eased: number) {
        for (const update of updaters) update(eased)
      }

      function step(now: number) {
        if (animationId !== volumeAnimation) {
          resolve()
          return
        }
        const raw = Math.min(1, (now - startedAt) / duration)
        const eased = raw * raw * (3 - 2 * raw)
        applyAll(eased)
        if (raw >= 1) {
          resolve()
          return
        }
        if (document.hidden) {
          applyAll(1)
          resolve()
          return
        }
        window.requestAnimationFrame(step)
      }

      if (document.hidden) {
        applyAll(1)
        resolve()
        return
      }
      window.requestAnimationFrame(step)
    })
  }

  function crossfadePlayers(oldAudio: HTMLAudioElement, newAudio: HTMLAudioElement) {
    return animateGain(
      [
        (eased) => setPlayerVolume(oldAudio, 1 - eased),
        (eased) => setPlayerVolume(newAudio, eased),
      ],
      CROSSFADE_DURATION,
    ).then(() => {
      setPlayerVolume(oldAudio, 0)
      setPlayerVolume(newAudio, 1)
    })
  }

  function fadePlayer(audio: HTMLAudioElement, fromGain: number, toGain: number, duration: number) {
    return animateGain(
      [(eased) => setPlayerVolume(audio, fromGain + (toGain - fromGain) * eased)],
      duration,
    ).then(() => {
      setPlayerVolume(audio, toGain)
    })
  }

  function syncMediaSession() {
    if (!('mediaSession' in navigator) || !currentTrack.value) return
    const track = currentTrack.value
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || 'Meliora',
      artwork: track.cover ? [{ src: track.cover }] : [],
    })
    navigator.mediaSession.playbackState = isPlaying.value ? 'playing' : 'paused'
  }

  function describePlaybackError(error: unknown, audio: HTMLAudioElement) {
    const reason = error as DOMException
    if (reason.name === 'AbortError') return ''
    if (reason.name === 'NotAllowedError') return '浏览器阻止了播放，请再次点击播放'

    if (!audio.currentSrc && !audio.src) return '当前歌曲没有可用的音频地址'
    if (audio.error?.code === MediaError.MEDIA_ERR_NETWORK)
      return '当前歌曲音频加载失败，请稍后再试'
    if (audio.error?.code === MediaError.MEDIA_ERR_DECODE) return '浏览器无法解码当前音频'
    if (audio.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED)
      return '当前歌曲音频源暂时不可用或格式不支持'
    if (reason.name === 'NotSupportedError') return '当前歌曲音频源暂时不可用或格式不支持'
    return '当前歌曲无法播放，请稍后再试'
  }

  async function play() {
    if (!currentTrack.value) {
      const first = store.queue[0] ?? store.tracks[0]
      if (!first) return
      store.selectTrack(first, store.queue.length ? store.queue : store.tracks)
      await Promise.resolve()
    }
    try {
      setPlayerVolume(activeAudio, 1)
      await activeAudio.play()
      isPlaying.value = true
      store.errorMessage = ''
      void startBeatAnalysis()
    } catch (error) {
      isPlaying.value = false
      store.errorMessage = describePlaybackError(error, activeAudio)
    }
  }

  function pause() {
    volumeAnimation += 1
    activeAudio.pause()
    preloadSlots.previous.audio.pause()
    preloadSlots.next.audio.pause()
    isPlaying.value = false
  }

  function toggle() {
    if (isPlaying.value) pause()
    else void play()
  }

  function seek(time: number) {
    if (!Number.isFinite(time)) return
    const safeTime = Math.max(0, time)
    // 当 active audio 还没有有效 duration 时，写入 currentTime 不会生效。
    // 把目标时间记录到 pendingSeekTime，等 metadata 就绪后再 flush，
    // 同时立即把 UI 的 currentTime 同步过去，避免进度条跳回原位。
    if (!Number.isFinite(activeAudio.duration) || activeAudio.duration === 0) {
      pendingSeekTime = safeTime
      currentTime.value = safeTime
      return
    }
    activeAudio.currentTime = Math.max(0, Math.min(safeTime, activeAudio.duration || safeTime))
    currentTime.value = activeAudio.currentTime
    pendingSeekTime = null
  }

  // 当 audio 的 duration 终于可用时，把之前记下的 pendingSeekTime 真正写入。
  function flushPendingSeek(audio: HTMLAudioElement) {
    if (audio !== activeAudio) return
    if (pendingSeekTime == null) return
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return
    const target = clamp(pendingSeekTime, 0, audio.duration)
    audio.currentTime = target
    currentTime.value = target
    pendingSeekTime = null
  }

  function commitActiveAudio(track: Track, queue: Track[], gain = 1) {
    volumeAnimation += 1
    transitionInProgress = false
    automaticCrossfadeStarted = false
    setPlayerVolume(activeAudio, gain)
    store.selectTrack(track, queue)
    currentTime.value = activeAudio.currentTime
    duration.value = Number.isFinite(activeAudio.duration) ? activeAudio.duration : 0
    syncMediaSession()
  }

  async function playActiveAudio(gain = 1) {
    try {
      setPlayerVolume(activeAudio, gain)
      await activeAudio.play()
      isPlaying.value = true
      store.errorMessage = ''
      void startBeatAnalysis()
      scheduleAdjacentPreload()
      return true
    } catch (error) {
      isPlaying.value = false
      store.errorMessage = describePlaybackError(error, activeAudio)
      return false
    }
  }

  function replaceActiveWithSlot(slot: PreloadSlot, direction: PreloadDirection) {
    const oldAudio = activeAudio
    const oldTrack = currentTrack.value
    const newAudio = slot.audio
    const reverseSlot = preloadSlots[direction === 'next' ? 'previous' : 'next']
    const spareAudio = reverseSlot.audio
    activeAudio = newAudio
    slot.audio = spareAudio
    slot.track = null
    slot.ready = null
    reverseSlot.audio = oldAudio
    reverseSlot.track = oldTrack
    reverseSlot.ready = oldTrack ? Promise.resolve(true) : null
    return { oldAudio, oldTrack, newAudio }
  }

  async function switchToTrack(
    track: Track,
    queue: Track[],
    updateStore: () => void,
    shouldPlay: boolean,
    direction: PreloadDirection,
    waitForReady: boolean,
  ): Promise<boolean> {
    if (transitionInProgress) return false
    transitionInProgress = true
    const requestId = ++switchRequestId
    const wasPlaying = isPlaying.value
    const useCrossfade = settings.value.smoothTrackChange && wasPlaying && shouldPlay
    const shouldSequentialFade = useCrossfade && !waitForReady
    const slot = findSlotByTrack(track) ?? preloadSlots[direction]
    if (waitForReady) {
      const ready =
        slot.track?.id === track.id
          ? await (slot.ready ?? Promise.resolve(slotCanStart(slot, track)))
          : await loadSlot(direction, track)
      if (!ready || requestId !== switchRequestId) {
        if (!ready) {
          failedTrackIds.add(track.id)
          if (shouldPlay && settings.value.skipOnError && queue.length > 1) {
            preloadMessage.value = `已跳过暂时无法播放的歌曲，正在继续播放`
            window.setTimeout(() => void next(false), 80)
          }
        }
        transitionInProgress = false
        return false
      }
    } else if (slot.track?.id !== track.id || !slot.audio.src) {
      clearSlot(slot)
      slot.track = track
      slot.ready = null
      slot.audio.volume = 0
      slot.audio.src = track.audioUrl
      slot.audio.load()
      void preloadCover(track.cover)
      void preloadLyrics(track.lyricsUrl)
    }

    const oldGain = audioGain(activeAudio)
    if (shouldSequentialFade) await fadePlayer(activeAudio, oldGain, 0, FADE_OUT_DURATION)
    if (requestId !== switchRequestId) {
      transitionInProgress = false
      return false
    }

    const { oldAudio, newAudio } = replaceActiveWithSlot(slot, direction)
    newAudio.currentTime = 0
    setPlayerVolume(newAudio, useCrossfade ? 0 : 1)
    // 切歌后上一次 seek 的 pending 时间不应被新歌沿用
    pendingSeekTime = null

    try {
      updateStore()
      currentTime.value = 0
      duration.value = Number.isFinite(activeAudio.duration) ? activeAudio.duration : 0
      syncMediaSession()
      if (shouldPlay) await newAudio.play()
      if (useCrossfade && waitForReady) await crossfadePlayers(oldAudio, newAudio)
      else if (useCrossfade) await fadePlayer(newAudio, 0, 1, FADE_IN_DURATION)
      oldAudio.pause()
      oldAudio.currentTime = 0
      oldAudio.volume = 0
      currentTime.value = activeAudio.currentTime
      duration.value = Number.isFinite(activeAudio.duration) ? activeAudio.duration : 0
      isPlaying.value = !activeAudio.paused
      automaticCrossfadeStarted = false
      syncMediaSession()
      transitionInProgress = false
      pendingSeekTime = null
      scheduleAdjacentPreload()
      return true
    } catch {
      failedTrackIds.add(track.id)
      preloadMessage.value = `已跳过暂时无法播放的歌曲，正在继续播放`
      newAudio.pause()
      activeAudio = oldAudio
      const reverseSlot = preloadSlots[direction === 'next' ? 'previous' : 'next']
      reverseSlot.audio = newAudio
      reverseSlot.track = null
      reverseSlot.ready = null
      clearSlot(reverseSlot)
      // 异常路径同样需要重置标志，否则后续任何切歌都会被 transitionInProgress 拒绝。
      transitionInProgress = false
      automaticCrossfadeStarted = false
      pendingSeekTime = null
      window.setTimeout(() => void next(false), 0)
      return false
    }
  }

  async function selectAndPlay(track: Track, queue: Track[]) {
    if (transitionInProgress) return
    transitionInProgress = true
    ++switchRequestId
    // 直接选中新曲目时，上一次 seek 的 pending 时间不应被新歌沿用。
    pendingSeekTime = null
    const wasPlaying = isPlaying.value
    const useSmoothSwitch = settings.value.smoothTrackChange && wasPlaying
    if (useSmoothSwitch) await fadePlayer(activeAudio, audioGain(activeAudio), 0, FADE_OUT_DURATION)
    else activeAudio.pause()
    const slot = findSlotByTrack(track)
    if (slot && slotCanStart(slot, track)) {
      const oldAudio = activeAudio
      const newAudio = slot.audio
      activeAudio = newAudio
      slot.audio = oldAudio
      slot.track = null
      slot.ready = null
      oldAudio.pause()
      oldAudio.currentTime = 0
      oldAudio.volume = 0
    } else {
      if (slot) clearSlot(slot)
      clearPreloads()
      activeAudio.src = track.audioUrl
      activeAudio.load()
      void preloadCover(track.cover)
      void preloadLyrics(track.lyricsUrl)
    }
    activeAudio.currentTime = 0
    setPlayerVolume(activeAudio, useSmoothSwitch ? 0 : 1)
    commitActiveAudio(track, queue, useSmoothSwitch ? 0 : 1)
    const played = await playActiveAudio(useSmoothSwitch ? 0 : 1)
    if (played && useSmoothSwitch) await fadePlayer(activeAudio, 0, 1, FADE_IN_DURATION)
    if (!played && settings.value.skipOnError && queue.length > 1) {
      failedTrackIds.add(track.id)
      window.setTimeout(() => void next(false), 80)
    }
  }

  async function next(manual = true) {
    const track = predictNextTrack(manual)
    if (!track) {
      pause()
      seek(0)
      return
    }
    await switchToTrack(
      track,
      store.queue,
      () => {
        store.nextTrack(manual, track.id)
      },
      isPlaying.value,
      'next',
      !manual,
    )
  }

  async function previous() {
    if (activeAudio.currentTime > 5) {
      seek(0)
      return
    }
    const queue = store.queue
    const candidates: Track[] = []
    for (let offset = 1; offset <= queue.length; offset += 1) {
      const index = (store.currentIndex - offset + queue.length) % queue.length
      const candidate = queue[index]
      if (candidate && !failedTrackIds.has(candidate.id)) {
        candidates.push(candidate)
      }
    }
    for (const track of candidates) {
      const switched = await switchToTrack(
        track,
        queue,
        () => store.previousTrack(track.id),
        isPlaying.value,
        'previous',
        false,
      )
      if (switched) return
    }
  }

  watch(
    currentTrack,
    (track, previousTrack) => {
      if (!track || transitionInProgress) return
      const resolvedUrl = new URL(track.audioUrl, window.location.href).href
      if (activeAudio.src === resolvedUrl) return
      activeAudio.src = track.audioUrl
      activeAudio.load()
      automaticCrossfadeStarted = false
      // 切换到全新音频源时旧的 pending seek 时间也要丢弃
      pendingSeekTime = null
      syncMediaSession()
      scheduleAdjacentPreload()
      if (previousTrack && isPlaying.value) void play()
    },
    { immediate: true, flush: 'sync' },
  )

  watch(
    () => settings.value.volume,
    () => {
      setPlayerVolume(activeAudio, 1)
    },
    { immediate: true },
  )
  watch(() => settings.value.playMode, clearPreloads)
  watch(
    () => settings.value.preloadNextTrack,
    (enabled) => {
      if (!enabled) clearPreloads()
      else scheduleAdjacentPreload()
    },
  )
  watch(
    () => store.queueVersion,
    () => {
      failedTrackIds.clear()
      clearPreloads()
      scheduleAdjacentPreload()
    },
  )
  watch(isPlaying, syncMediaSession)

  function handleTimeUpdate(audio: HTMLAudioElement) {
    if (audio !== activeAudio) return
    currentTime.value = audio.currentTime
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      const remaining = audio.duration - audio.currentTime
      if (
        settings.value.smoothTrackChange &&
        preloadSlots.next.track &&
        !automaticCrossfadeStarted &&
        remaining <= CROSSFADE_DURATION / 1000
      ) {
        automaticCrossfadeStarted = true
        void next(false)
      }
    }
    if ('mediaSession' in navigator && Number.isFinite(audio.duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: Math.min(audio.currentTime, audio.duration),
        })
      } catch {
        // Browsers can reject position updates during media transitions.
      }
    }
  }

  type AudioListenerEntry = {
    audio: HTMLAudioElement
    type: string
    listener: EventListener
  }
  const audioListeners: AudioListenerEntry[] = []

  function bindAudioListener(audio: HTMLAudioElement, type: string, listener: EventListener) {
    audio.addEventListener(type, listener)
    audioListeners.push({ audio, type, listener })
  }

  for (const audio of players) {
    const onTimeUpdate: EventListener = () => handleTimeUpdate(audio)
    const onDurationChange: EventListener = () => {
      if (audio === activeAudio) {
        duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
        flushPendingSeek(audio)
        scheduleAdjacentPreload()
      }
    }
    const onLoadedMetadata: EventListener = () => {
      if (audio === activeAudio) {
        duration.value = Number.isFinite(audio.duration) ? audio.duration : 0
        flushPendingSeek(audio)
      }
    }
    const onCanPlay: EventListener = () => {
      if (audio === activeAudio) scheduleAdjacentPreload()
    }
    const onPlay: EventListener = () => {
      if (audio === activeAudio) {
        isPlaying.value = true
        void startBeatAnalysis()
      }
    }
    const onPause: EventListener = () => {
      if (audio === activeAudio && !transitionInProgress) {
        isPlaying.value = false
        stopBeatAnalysis()
      }
    }
    const onEnded: EventListener = () => {
      if (audio === activeAudio && !transitionInProgress) void next(false)
    }
    const onError: EventListener = () => {
      if (audio !== activeAudio) return
      const failedTrack = currentTrack.value
      // 即便正处于过渡阶段也要记录失败的 trackId，避免静默吞错导致后续无法定位问题。
      if (transitionInProgress) {
        if (failedTrack) {
          failedTrackIds.add(failedTrack.id)
          console.warn(
            '[useAudioPlayer] active audio error during transition',
            failedTrack.id,
            audio.error,
          )
        } else {
          console.warn('[useAudioPlayer] active audio error during transition', audio.error)
        }
        return
      }
      if (failedTrack) {
        failedTrackIds.add(failedTrack.id)
        preloadMessage.value = `已跳过暂时无法播放的歌曲，正在继续播放`
      }
      store.errorMessage = ''
      if (settings.value.skipOnError && store.queue.length > 1) {
        window.setTimeout(() => void next(false), 80)
      }
    }

    bindAudioListener(audio, 'timeupdate', onTimeUpdate)
    bindAudioListener(audio, 'durationchange', onDurationChange)
    bindAudioListener(audio, 'loadedmetadata', onLoadedMetadata)
    bindAudioListener(audio, 'canplay', onCanPlay)
    bindAudioListener(audio, 'play', onPlay)
    bindAudioListener(audio, 'pause', onPause)
    bindAudioListener(audio, 'ended', onEnded)
    bindAudioListener(audio, 'error', onError)
  }

  const MEDIA_SESSION_ACTIONS: MediaSessionAction[] = [
    'play',
    'pause',
    'previoustrack',
    'nexttrack',
    'seekto',
    'seekbackward',
    'seekforward',
  ]

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => void play())
    navigator.mediaSession.setActionHandler('pause', pause)
    navigator.mediaSession.setActionHandler('previoustrack', () => void previous())
    navigator.mediaSession.setActionHandler('nexttrack', () => void next())
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) seek(details.seekTime)
    })
    navigator.mediaSession.setActionHandler('seekbackward', (details) =>
      seek(activeAudio.currentTime - (details.seekOffset || 10)),
    )
    navigator.mediaSession.setActionHandler('seekforward', (details) =>
      seek(activeAudio.currentTime + (details.seekOffset || 10)),
    )
  }

  onBeforeUnmount(() => {
    stopBeatAnalysis()
    volumeAnimation += 1
    for (const { audio, type, listener } of audioListeners) {
      audio.removeEventListener(type, listener)
    }
    audioListeners.length = 0
    for (const audio of players) {
      audio.pause()
      audio.src = ''
    }
    if ('mediaSession' in navigator) {
      for (const action of MEDIA_SESSION_ACTIONS) {
        try {
          navigator.mediaSession.setActionHandler(action, null)
        } catch {
          // 某些浏览器对部分 action 不支持，setActionHandler(action, null) 会抛错，忽略即可。
        }
      }
    }
  })

  return {
    audio: activeAudio,
    beatLevel,
    spectrumLevels,
    preloadMessage,
    play,
    pause,
    toggle,
    seek,
    next,
    previous,
    selectAndPlay,
  }
}
