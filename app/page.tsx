'use client'

import { useState, useRef, useCallback } from 'react'
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

const MAX_IMAGES = 3
const LIMITATIONS = [
  '캐릭터 일관성 보장 불가 — 장면마다 외모가 달라질 수 있습니다.',
  '참조 이미지의 스타일은 텍스트 프롬프트로만 반영됩니다 (완벽한 화풍 이전 불가).',
  'Pollinations.ai 무료 서버 특성상 이미지 생성에 10~30초가 소요될 수 있습니다.',
  '하루 생성 횟수가 많을 경우 Pollinations.ai 속도가 저하될 수 있습니다.',
  '생성된 이미지의 상업적 이용 전, Pollinations.ai 이용약관을 확인하세요.',
]

export default function Home() {
  const [referenceImages, setReferenceImages] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [narrative, setNarrative] = useState('')
  const [panelCount, setPanelCount] = useState<10 | 20>(10)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
  const [isDownloading, setIsDownloading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const handleImageAdd = useCallback((files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files).slice(0, MAX_IMAGES - referenceImages.length)
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f))
    setReferenceImages((prev) => [...prev, ...newFiles])
    setPreviewUrls((prev) => [...prev, ...newPreviews])
  }, [referenceImages.length])

  const handleRemoveImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index])
    setReferenceImages((prev) => prev.filter((_, i) => i !== index))
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleImageAdd(e.dataTransfer.files)
  }, [handleImageAdd])

  const handleGenerate = async () => {
    if (!narrative.trim()) {
      setError('시나리오를 입력해주세요.')
      return
    }
    setError(null)
    setResult(null)
    setLoadedImages(new Set())
    setIsGenerating(true)

    try {
      const formData = new FormData()
      formData.append('narrative', narrative)
      formData.append('panelCount', String(panelCount))
      formData.append('imageCount', String(referenceImages.length))
      referenceImages.forEach((file, i) => formData.append(`image_${i}`, file))

      const res = await fetch('/api/generate', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || '생성 실패')
      setResult(data)

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 300)
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

      // Text file with full storyboard
      const textContent = result.panels
        .map(
          (p) =>
            `[패널 ${p.id}] ${p.caption}\n대사: ${p.dialogue || '(없음)'}\n지문: ${p.stageDirection}\n이미지 URL: ${p.imageUrl}\n`
        )
        .join('\n---\n\n')
      zip.file('storyboard.txt', textContent)

      // Download each image
      await Promise.all(
        result.panels.map(async (panel) => {
          try {
            const resp = await fetch(panel.imageUrl)
            if (resp.ok) {
              const blob = await resp.blob()
              imgFolder.file(`panel_${String(panel.id).padStart(2, '0')}.jpg`, blob)
            }
          } catch {
            // skip failed images
          }
        })
      )

      const blob = await zip.generateAsync({ type: 'blob' })
      saveAs(blob, 'storyboard.zip')
    } finally {
      setIsDownloading(false)
    }
  }

  const markImageLoaded = (id: number) => {
    setLoadedImages((prev) => new Set(prev).add(id))
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
        {/* Step 1: Reference Images */}
        <section className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">STEP 1</span>
            <h2 className="text-base font-semibold text-white">참조 이미지 업로드</h2>
            <span className="text-xs text-gray-500 ml-1">(선택, 최대 3장 — 스타일 톤 참조용)</span>
          </div>

          <div
            className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500 transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => referenceImages.length < MAX_IMAGES && fileInputRef.current?.click()}
          >
            {referenceImages.length === 0 ? (
              <div className="text-gray-500">
                <p className="text-3xl mb-2">🖼️</p>
                <p className="text-sm">이미지를 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs mt-1">JPG, PNG, WEBP · 최대 3장</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3 justify-center">
                {previewUrls.map((url, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`참조 이미지 ${i + 1}`}
                      className="w-28 h-20 object-cover rounded-lg border border-gray-700"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveImage(i) }}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {referenceImages.length < MAX_IMAGES && (
                  <div className="w-28 h-20 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center text-gray-500 text-2xl">
                    +
                  </div>
                )}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => handleImageAdd(e.target.files)}
          />
        </section>

        {/* Step 2: Narrative */}
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
                <button
                  key={n}
                  onClick={() => setPanelCount(n)}
                  className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                    panelCount === n
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {n}장
                </button>
              ))}
            </div>
          </div>
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
          ) : (
            '🎬 스토리보드 생성하기'
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div ref={resultRef}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-white">스토리보드 결과</h2>
                <p className="text-xs text-gray-500 mt-0.5">총 {result.panels.length}개 패널 · 이미지는 순차적으로 로드됩니다</p>
              </div>
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    다운로드 중...
                  </>
                ) : (
                  <>⬇ ZIP 다운로드</>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {result.panels.map((panel, idx) => (
                <div
                  key={panel.id}
                  className="panel-animate bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 hover:border-gray-600 transition-colors"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  {/* Image */}
                  <div className="relative w-full aspect-video bg-gray-800">
                    {!loadedImages.has(panel.id) && (
                      <div className="absolute inset-0 panel-image-skeleton" />
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={panel.imageUrl}
                      alt={panel.caption}
                      className={`w-full h-full object-cover transition-opacity duration-500 ${
                        loadedImages.has(panel.id) ? 'opacity-100' : 'opacity-0'
                      }`}
                      onLoad={() => markImageLoaded(panel.id)}
                      onError={() => markImageLoaded(panel.id)}
                    />
                    <div className="absolute top-2 left-2 bg-black/60 backdrop-blur text-white text-xs px-2 py-0.5 rounded-full font-mono">
                      #{String(panel.id).padStart(2, '0')}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 space-y-2">
                    <h3 className="text-sm font-bold text-white">{panel.caption}</h3>

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
                <span className="text-gray-600 mt-0.5 shrink-0">•</span>
                {text}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-600 mt-4 pt-4 border-t border-gray-800">
            Powered by Claude AI (Anthropic) + Pollinations.ai
          </p>
        </section>
      </div>
    </main>
  )
}
