'use client'

import { useState, useRef, useEffect } from 'react'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

interface Panel {
  id: number
  caption: string
  imagePrompt: string
  dialogue: string
  stageDirection: string
  imageUrl: string
}

interface GenerateResult {
  panels: Panel[]
  styleDescription: string
}

const LIMITATIONS = [
  '캐릭터 일관성 보장 불가 — 장면마다 외모가 달라질 수 있습니다.',
  '참조 이미지의 스타일은 텍스트 프롬프트로만 반영됩니다 (완벽한 화풍 이전 불가).',
  'Pollinations.ai 무료 서버 특성상 이미지 생성에 10~30초가 소요될 수 있습니다.',
  '하루 생성 횟수가 많을 경우 Pollinations.ai 속도가 저하될 수 있습니다.',
  '생성된 이미지의 상업적 이용 전, Pollinations.ai 이용약관을 확인하세요.',
]

const MOOD_PRESETS = ['따뜻한 가족 드라마', '공포 스릴러', '밝고 경쾌한 광고', '감성 뮤직비디오', '다큐멘터리', '액션 블록버스터', '로맨스', '코미디']

// 이미지를 최대 800px로 압축해서 File 객체로 반환
async function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 800
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * ratio
      canvas.height = img.height * ratio
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        resolve(new File([blob!], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
      }, 'image/jpeg', 0.85)
    }
    img.src = url
  })
}

export default function Home() {
  const [slots, setSlots] = useState<(File | null)[]>([null, null, null])
  const [previews, setPreviews] = useState<(string | null)[]>([null, null, null])
  const [narrative, setNarrative] = useState('')
  const [mood, setMood] = useState('')
  const [panelCount, setPanelCount] = useState<10 | 20>(10)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set())
  const [panelUrls, setPanelUrls] = useState<Record<number, string>>({})
  const [activeUrls, setActiveUrls] = useState<Record<number, string>>({})
  const [isDownloading, setIsDownloading] = useState(false)
  const fileRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const resultRef = useRef<HTMLDivElement>(null)
  const imageTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  // 이미지를 1.5초 간격으로 순차 로딩 + 패널당 25초 타임아웃
  useEffect(() => {
    if (!result || Object.keys(panelUrls).length === 0) return
    const staggerTimers: ReturnType<typeof setTimeout>[] = []

    result.panels.forEach((panel, idx) => {
      const t = setTimeout(() => {
        const url = panelUrls[panel.id]
        if (!url) return
        setActiveUrls((prev) => ({ ...prev, [panel.id]: url }))

        // 25초 안에 로드 안 되면 자동 실패 처리
        imageTimers.current[panel.id] = setTimeout(() => {
          setLoadedImages((prev) => {
            if (!prev.has(panel.id)) {
              setFailedImages((f) => new Set(f).add(panel.id))
            }
            return prev
          })
        }, 25000)
      }, idx * 1500)
      staggerTimers.push(t)
    })

    return () => {
      staggerTimers.forEach(clearTimeout)
      Object.values(imageTimers.current).forEach(clearTimeout)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, panelUrls])

  const handleSlotChange = async (index: number, file: File | null) => {
    if (!file) return
    const compressed = await compressImage(file)
    const url = URL.createObjectURL(compressed)
    setSlots((prev) => { const next = [...prev]; next[index] = compressed; return next })
    setPreviews((prev) => {
      if (prev[index]) URL.revokeObjectURL(prev[index]!)
      const next = [...prev]; next[index] = url; return next
    })
  }

  const handleSlotRemove = (index: number) => {
    if (previews[index]) URL.revokeObjectURL(previews[index]!)
    setSlots((prev) => { const next = [...prev]; next[index] = null; return next })
    setPreviews((prev) => { const next = [...prev]; next[index] = null; return next })
    if (fileRefs[index].current) fileRefs[index].current!.value = ''
  }

  const handleGenerate = async () => {
    if (!narrative.trim()) { setError('시나리오를 입력해주세요.'); return }
    setError(null)
    setResult(null)
    setLoadedImages(new Set())
    setFailedImages(new Set())
    setPanelUrls({})
    setIsGenerating(true)

    try {
      const formData = new FormData()
      formData.append('narrative', narrative)
      formData.append('mood', mood)
      formData.append('panelCount', String(panelCount))
      const activeImages = slots.filter(Boolean) as File[]
      formData.append('imageCount', String(activeImages.length))
      activeImages.forEach((file, i) => formData.append(`image_${i}`, file))

      const res = await fetch('/api/generate', { method: 'POST', body: formData })
      const text = await res.text()
      let data: { error?: string; panels?: Panel[]; styleDescription?: string }
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(`서버 오류가 발생했습니다. (${res.status}) — 잠시 후 다시 시도해주세요.`)
      }
      if (!res.ok) throw new Error(data.error || '생성 실패')
      const generatedResult = data as GenerateResult
      setResult(generatedResult)
      // panelUrls 초기화
      const urls: Record<number, string> = {}
      generatedResult.panels.forEach((p) => { urls[p.id] = p.imageUrl })
      setPanelUrls(urls)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleDownload = async () => {
    if (!result) return
    setIsDownloading(true)
    try {
      const zip = new JSZip()
      const imgFolder = zip.folder('images')!
      const textContent = result.panels
        .map((p) => `[패널 ${p.id}] ${p.caption}\n대사: ${p.dialogue || '(없음)'}\n지문: ${p.stageDirection}\n이미지 URL: ${p.imageUrl}\n`)
        .join('\n---\n\n')
      zip.file('storyboard.txt', textContent)
      await Promise.all(
        result.panels.map(async (panel) => {
          try {
            const resp = await fetch(panel.imageUrl)
            if (resp.ok) imgFolder.file(`panel_${String(panel.id).padStart(2, '0')}.jpg`, await resp.blob())
          } catch { /* skip */ }
        })
      )
      saveAs(await zip.generateAsync({ type: 'blob' }), 'storyboard.zip')
    } finally { setIsDownloading(false) }
  }

  const markImageLoaded = (id: number) => {
    setLoadedImages((prev) => new Set(prev).add(id))
    setFailedImages((prev) => { const next = new Set(prev); next.delete(id); return next })
  }

  const markImageFailed = (id: number) => {
    setFailedImages((prev) => new Set(prev).add(id))
  }

  const retryImage = (id: number) => {
    clearTimeout(imageTimers.current[id])
    const seed = Math.floor(Math.random() * 99999)
    const base = (panelUrls[id] ?? '').split('?')[0]
    const newUrl = `${base}?width=800&height=500&nologo=true&seed=${seed}`

    setPanelUrls((prev) => ({ ...prev, [id]: newUrl }))
    setActiveUrls((prev) => ({ ...prev, [id]: newUrl }))
    setLoadedImages((prev) => { const n = new Set(prev); n.delete(id); return n })
    setFailedImages((prev) => { const n = new Set(prev); n.delete(id); return n })

    imageTimers.current[id] = setTimeout(() => {
      setFailedImages((f) => new Set(f).add(id))
    }, 25000)
  }

  const retryAllFailed = () => {
    const ids = Array.from(failedImages)
    ids.forEach((id, i) => setTimeout(() => retryImage(id), i * 1500))
  }

  return (
    <main className="min-h-screen bg-gray-950 pb-24">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <span className="text-2xl">🎬</span>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">스토리보드 생성기</h1>
            <p className="text-xs text-gray-400">AI 시나리오 분석 → 자동 스토리보드 제작</p>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 mt-10 space-y-8">

        {/* STEP 1: 참조 이미지 — 3개 슬롯 가로 배치 */}
        <section className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <div className="flex items-center gap-2 mb-5">
            <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">STEP 1</span>
            <h2 className="text-base font-semibold text-white">참조 이미지 업로드</h2>
            <span className="text-xs text-gray-500 ml-1">(선택 · 스타일 톤 참조용)</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <p className="text-xs text-gray-500 text-center">참조 이미지 {i + 1}</p>
                <div
                  className={`relative aspect-video rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors overflow-hidden
                    ${previews[i] ? 'border-indigo-500' : 'border-gray-700 hover:border-indigo-500'}`}
                  onClick={() => !previews[i] && fileRefs[i].current?.click()}
                >
                  {previews[i] ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previews[i]!} alt={`참조 ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSlotRemove(i) }}
                        className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-red-600 text-white rounded-full w-6 h-6 text-sm flex items-center justify-center transition-colors"
                      >×</button>
                    </>
                  ) : (
                    <div className="text-center text-gray-600 p-3">
                      <p className="text-2xl mb-1">+</p>
                      <p className="text-xs">클릭하여 업로드</p>
                      <p className="text-xs mt-0.5">JPG · PNG · WEBP</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRefs[i]}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleSlotChange(i, e.target.files?.[0] ?? null)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* STEP 2: 시나리오 입력 */}
        <section className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">STEP 2</span>
            <h2 className="text-base font-semibold text-white">시나리오 입력</h2>
          </div>

          <textarea
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="스토리보드로 만들고 싶은 내러티브를 상세하게 입력해주세요.&#10;&#10;예) 주인공 민준은 폐허가 된 도시를 걷다가 낯선 소녀를 만난다. 소녀는 사라진 기억을 찾아달라 부탁하고, 두 사람은 함께 기억의 미로 속으로 들어간다..."
            className="w-full bg-gray-800 border border-gray-700 rounded-xl p-4 text-sm text-gray-100 placeholder-gray-600 resize-none h-40 focus:outline-none focus:border-indigo-500 transition-colors"
          />

          <div className="mt-4">
            <p className="text-xs text-gray-400 mb-2">패널 수 선택</p>
            <div className="flex gap-3">
              {([10, 20] as const).map((n) => (
                <button key={n} onClick={() => setPanelCount(n)}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${panelCount === n ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}>
                  {n}장
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* STEP 3: 분위기 / 용도 */}
        <section className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">STEP 3</span>
            <h2 className="text-base font-semibold text-white">영상 분위기 · 용도</h2>
            <span className="text-xs text-gray-500 ml-1">(선택)</span>
          </div>

          {/* 프리셋 버튼 */}
          <div className="flex flex-wrap gap-2 mb-3">
            {MOOD_PRESETS.map((preset) => (
              <button
                key={preset}
                onClick={() => setMood(mood === preset ? '' : preset)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  mood === preset
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            placeholder="직접 입력하거나 위에서 선택하세요. 예) 90년대 홍콩 느와르 스타일의 범죄 스릴러"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </section>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !narrative.trim()}
          className="w-full py-4 rounded-xl text-base font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] text-white shadow-lg shadow-indigo-900/40"
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              AI가 스토리보드를 구성하는 중... (30초~1분 소요)
            </span>
          ) : '🎬 스토리보드 생성하기'}
        </button>

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">⚠️ {error}</div>
        )}

        {/* Result */}
        {result && (
          <div ref={resultRef}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">스토리보드 결과</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  이미지 <span className="text-indigo-400 font-semibold">{loadedImages.size}</span> / {result.panels.length} 로드됨
                  {failedImages.size > 0 && <span className="text-red-400 ml-2">· {failedImages.size}개 실패</span>}
                </p>
              </div>
              <div className="flex gap-2">
                {failedImages.size > 0 && (
                  <button onClick={retryAllFailed}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-yellow-300 transition-colors">
                    🔄 실패 이미지 재시도
                  </button>
                )}
                <button onClick={handleDownload} disabled={isDownloading}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors disabled:opacity-50">
                  {isDownloading ? (
                    <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>다운로드 중...</>
                  ) : <>⬇ ZIP 다운로드</>}
                </button>
              </div>
            </div>

            {/* 전체 로딩 진행 바 */}
            {loadedImages.size < result.panels.length && (
              <div className="mb-6">
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${(loadedImages.size / result.panels.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {result.panels.map((panel, idx) => (
                <div key={panel.id}
                  className="panel-animate bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 hover:border-gray-600 transition-colors"
                  style={{ animationDelay: `${idx * 0.05}s` }}>
                  {/* 컷 넘버 헤더 */}
                  <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                    <span className="text-2xl font-black text-white font-mono tracking-tight">
                      #{String(panel.id).padStart(2, '0')}
                    </span>
                    <h3 className="text-sm font-bold text-white">{panel.caption}</h3>
                  </div>

                  {/* 이미지 영역 */}
                  <div className="relative w-full aspect-video bg-gray-800">
                    {/* 로딩 중 (아직 activeUrl 없거나 로드 중) */}
                    {!loadedImages.has(panel.id) && !failedImages.has(panel.id) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-800">
                        <svg className="animate-spin h-8 w-8 text-indigo-400" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <p className="text-xs text-gray-500">이미지 생성 중...</p>
                      </div>
                    )}
                    {/* 실패 상태 */}
                    {failedImages.has(panel.id) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-800">
                        <p className="text-xs text-gray-500">이미지 로드 실패</p>
                        <button onClick={() => retryImage(panel.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-indigo-600 rounded-lg text-xs text-white transition-colors">
                          🔄 다시 시도
                        </button>
                      </div>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {activeUrls[panel.id] && (
                      <img
                        src={activeUrls[panel.id]}
                        alt={panel.caption}
                        className={`w-full h-full object-cover transition-opacity duration-500 ${loadedImages.has(panel.id) ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => markImageLoaded(panel.id)}
                        onError={() => markImageFailed(panel.id)}
                      />
                    )}
                  </div>

                  <div className="p-4 space-y-2">
                    <h3 className="sr-only">{panel.caption}</h3>
                    {panel.dialogue && (
                      <div className="bg-gray-800 rounded-lg px-3 py-2">
                        <span className="text-xs text-indigo-400 font-semibold block mb-0.5">대사</span>
                        <p className="text-sm text-gray-200 leading-relaxed">"{panel.dialogue}"</p>
                      </div>
                    )}
                    <div className="bg-gray-800/50 rounded-lg px-3 py-2">
                      <span className="text-xs text-gray-500 font-semibold block mb-0.5">지문</span>
                      <p className="text-xs text-gray-400 leading-relaxed">{panel.stageDirection}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Limitations */}
        <section className="mt-12 bg-gray-900/50 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <span>⚠️</span> 플랫폼 한계 안내
          </h3>
          <ul className="space-y-2">
            {LIMITATIONS.map((text, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                <span className="text-gray-600 mt-0.5 shrink-0">•</span>{text}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-600 mt-4 pt-4 border-t border-gray-800">
            Powered by Gemini AI (Google) + Pollinations.ai
          </p>
        </section>
      </div>
    </main>
  )
}
