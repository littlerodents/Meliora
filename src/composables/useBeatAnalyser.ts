import { onBeforeUnmount, ref, type Ref } from 'vue'

// 模块级缓存：避免对同一 HTMLAudioElement 重复调用 createMediaElementSource
// 浏览器对同一个 audio 节点只允许 attach 一次，重复 attach 会抛出 InvalidStateError
const attachedAudios = new WeakSet<HTMLAudioElement>()
const mediaSourceMap = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>()

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export interface BeatAnalyserOptions {
  players: readonly HTMLAudioElement[]
  getActiveAudio: () => HTMLAudioElement
  isPlaying: Ref<boolean>
}

export function useBeatAnalyser(options: BeatAnalyserOptions) {
  const { players, getActiveAudio } = options
  const beatLevel = ref(0)
  const spectrumLevels = ref([0.1, 0.1, 0.1, 0.1])
  let audioContext: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let frequencyData: Uint8Array<ArrayBuffer> | null = null
  let previousFrequencyData: Float32Array | null = null
  let beatFrame = 0
  let energyFloor = 0.08
  let fluxFloor = 0.02
  let beatPeak = 0.35
  let spectrumPeak = 0.28
  let spectrumTick = 0

  function stopBeatAnalysis() {
    window.cancelAnimationFrame(beatFrame)
    beatFrame = 0
    beatLevel.value = 0
    if (previousFrequencyData) previousFrequencyData.fill(0)
    spectrumLevels.value = spectrumLevels.value.map(() => 0.08)
  }

  function bandEnergy(data: Uint8Array<ArrayBuffer>, from: number, to: number) {
    const start = Math.max(1, Math.min(data.length - 1, from))
    const end = Math.max(start + 1, Math.min(data.length, to))
    let energy = 0
    for (let index = start; index < end; index += 1) {
      const value = data[index] ?? 0
      energy += value * value
    }
    return Math.sqrt(energy / Math.max(1, end - start)) / 255
  }

  function spectralFlux(data: Uint8Array<ArrayBuffer>, from: number, to: number) {
    if (!previousFrequencyData) return 0
    const start = Math.max(1, Math.min(data.length - 1, from))
    const end = Math.max(start + 1, Math.min(data.length, to))
    let flux = 0
    for (let index = start; index < end; index += 1) {
      const current = (data[index] ?? 0) / 255
      const previous = previousFrequencyData[index] ?? 0
      const rise = current - previous
      if (rise > 0) flux += rise * rise
    }
    return Math.sqrt(flux / Math.max(1, end - start))
  }

  function updateBeatLevel() {
    const activeAudio = getActiveAudio()
    if (!analyser || !frequencyData || activeAudio.paused) {
      beatLevel.value *= 0.88
      spectrumLevels.value = spectrumLevels.value.map((level) => Math.max(0.08, level * 0.82))
      if (beatLevel.value > 0.005) beatFrame = window.requestAnimationFrame(updateBeatLevel)
      else stopBeatAnalysis()
      return
    }
    analyser.getByteFrequencyData(frequencyData)
    const data = frequencyData
    const bassEnd = Math.max(7, Math.floor(data.length * 0.1))
    const lowMidEnd = Math.max(bassEnd + 5, Math.floor(data.length * 0.24))
    const bassEnergy = bandEnergy(data, 1, bassEnd)
    const lowMidEnergy = bandEnergy(data, bassEnd, lowMidEnd)
    const totalEnergy = bassEnergy * 0.72 + lowMidEnergy * 0.28
    const flux = spectralFlux(data, 1, lowMidEnd)
    energyFloor = energyFloor * 0.988 + totalEnergy * 0.012
    fluxFloor = fluxFloor * 0.982 + flux * 0.018
    const energyOnset = Math.max(0, totalEnergy - energyFloor * 1.08)
    const fluxOnset = Math.max(0, flux - fluxFloor * 1.2)
    beatPeak = Math.max(energyOnset * 2.9 + fluxOnset * 4.2, beatPeak * 0.965, 0.18)
    const pulse = clamp((energyOnset * 2.9 + fluxOnset * 4.2) / beatPeak, 0, 1)
    const shapedPulse = pulse < 0.08 ? 0 : Math.pow(pulse, 1.28)
    beatLevel.value +=
      (shapedPulse - beatLevel.value) * (shapedPulse > beatLevel.value ? 0.52 : 0.12)

    spectrumTick += 1
    const sampleGroups = [
      [4, 17, 58],
      [9, 34, 82],
      [3, 26, 49],
      [13, 43, 69],
    ]
    const performanceShape = [
      0.86 + Math.sin(spectrumTick * 0.13) * 0.16,
      1.08 + Math.sin(spectrumTick * 0.17 + 1.7) * 0.18,
      0.94 + Math.sin(spectrumTick * 0.11 + 3.1) * 0.17,
      1.02 + Math.sin(spectrumTick * 0.19 + 4.4) * 0.2,
    ]
    const contrastShape = [0.92, 1.08, 0.84, 1.16]
    const nextSpectrum = spectrumLevels.value.map((previous, band) => {
      const samples = sampleGroups[band] ?? sampleGroups[0]
      const weightedEnergy = samples.reduce((total, rawIndex, sampleIndex) => {
        const index = Math.min(data.length - 1, rawIndex)
        const value = data[index] ?? 0
        return total + value * value * (1 - sampleIndex * 0.08)
      }, 0)
      const normalized = Math.sqrt(weightedEnergy / samples.length) / 255
      spectrumPeak = Math.max(normalized, spectrumPeak * 0.992)
      const relative = normalized / Math.max(0.18, spectrumPeak)
      const contrasted = Math.pow(relative, 1.55) * (contrastShape[band] ?? 1)
      const lively = contrasted * (performanceShape[band] ?? 1)
      const pulseLift = beatLevel.value * (band % 2 === 0 ? 0.08 : 0.18)
      const target = Math.max(0.09, Math.min(0.88, lively * 0.66 + normalized * 0.14 + pulseLift))
      return previous + (target - previous) * (target > previous ? 0.44 : 0.24)
    })
    spectrumLevels.value = nextSpectrum
    if (!previousFrequencyData || previousFrequencyData.length !== data.length) {
      previousFrequencyData = new Float32Array(data.length)
    }
    for (let index = 0; index < data.length; index += 1) {
      previousFrequencyData[index] = (data[index] ?? 0) / 255
    }
    beatFrame = window.requestAnimationFrame(updateBeatLevel)
  }

  async function startBeatAnalysis() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    try {
      if (!audioContext) {
        audioContext = new AudioContext()
        analyser = audioContext.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.5
        players.forEach((audio) => {
          // 通过 WeakSet 守卫确保每个 audio 只 attach 一次；
          // 即使 hook 多次实例化或热更新触发，也不会再次抛出 InvalidStateError。
          if (attachedAudios.has(audio)) {
            const cached = mediaSourceMap.get(audio)
            if (cached) {
              cached.connect(analyser!)
            }
            return
          }
          try {
            const source = audioContext!.createMediaElementSource(audio)
            attachedAudios.add(audio)
            mediaSourceMap.set(audio, source)
            source.connect(analyser!)
          } catch (error) {
            // 兜底：极端情况下浏览器仍可能抛 InvalidStateError，复用已缓存 source。
            const cached = mediaSourceMap.get(audio)
            if (cached) {
              attachedAudios.add(audio)
              cached.connect(analyser!)
            } else {
              console.warn('[useAudioPlayer] createMediaElementSource failed', error)
            }
          }
        })
        analyser.connect(audioContext.destination)
        frequencyData = new Uint8Array(analyser.frequencyBinCount)
        previousFrequencyData = new Float32Array(analyser.frequencyBinCount)
      }
      if (audioContext.state === 'suspended') await audioContext.resume()
      if (!beatFrame) beatFrame = window.requestAnimationFrame(updateBeatLevel)
    } catch {
      stopBeatAnalysis()
    }
  }

  onBeforeUnmount(() => {
    stopBeatAnalysis()
    void audioContext?.close()
  })

  return { beatLevel, spectrumLevels, startBeatAnalysis, stopBeatAnalysis }
}
