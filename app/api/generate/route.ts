import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, Part } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export const maxDuration = 120

interface Panel {
  id: number
  caption: string
  imagePrompt: string
  dialogue: string
  stageDirection: string
  imageUrl: string
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const narrative = formData.get('narrative') as string
    const mood = (formData.get('mood') as string) || ''
    const panelCount = parseInt((formData.get('panelCount') as string) || '10')
    const imageCount = parseInt((formData.get('imageCount') as string) || '0')

    if (!narrative || narrative.trim().length < 10) {
      return NextResponse.json({ error: '시나리오를 더 자세히 입력해주세요.' }, { status: 400 })
    }

    // Collect reference images
    const imageParts: Part[] = []
    for (let i = 0; i < imageCount; i++) {
      const file = formData.get(`image_${i}`) as File | null
      if (file) {
        const buffer = await file.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        imageParts.push({
          inlineData: { mimeType: file.type, data: base64 },
        })
      }
    }

    const hasImages = imageParts.length > 0
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `${hasImages ? '위의 참조 이미지들을 분석하여 아트 스타일(화풍, 색감, 분위기, 렌더링 기법 등)을 파악하세요.\n\n' : ''}다음 시나리오를 정확히 ${panelCount}개의 스토리보드 패널로 나눠주세요.
${mood ? `\n영상 분위기 및 용도: ${mood}\n이 분위기와 용도에 맞게 이미지 프롬프트, 대사, 지문의 톤을 조정하세요.\n` : ''}
시나리오:
${narrative}

아래 JSON 형식으로만 응답하세요. JSON 외 다른 텍스트나 마크다운 코드블록은 절대 포함하지 마세요:

{
  "styleDescription": "${hasImages ? '참조 이미지에서 추출한 아트 스타일 설명 (영어로)' : 'cinematic illustrated storyboard style, detailed linework'}",
  "panels": [
    {
      "id": 1,
      "caption": "패널 제목 (한국어, 10자 이내)",
      "imagePrompt": "이미지 생성용 상세 프롬프트 (영어만, 100자 이내)",
      "dialogue": "이 장면의 대사 (한국어, 없으면 빈 문자열)",
      "stageDirection": "지문/행동 묘사 (한국어, 50자 이내)"
    }
  ]
}

규칙:
- panels 배열에 정확히 ${panelCount}개 항목 필수
- imagePrompt는 반드시 영어로만 작성
- dialogue와 stageDirection은 한국어로 작성
- 시나리오 흐름을 자연스럽게 ${panelCount}개로 분배`

    const parts: Part[] = [...imageParts, { text: prompt }]
    const result = await model.generateContent(parts)
    const rawText = result.response.text().trim()

    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('응답 파싱 실패: JSON 형식이 아닙니다.')

    const parsed = JSON.parse(jsonMatch[0])
    const styleDescription: string = parsed.styleDescription || 'cinematic storyboard style'

    const panels: Panel[] = parsed.panels.map((p: Omit<Panel, 'imageUrl'>) => {
      const seed = Math.floor(Math.random() * 99999)
      const prompt = encodeURIComponent(
        `${p.imagePrompt}, ${styleDescription}, storyboard panel, high quality`
      )
      const imageUrl = `https://image.pollinations.ai/prompt/${prompt}?width=800&height=500&nologo=true&seed=${seed}`
      return { ...p, imageUrl }
    })

    return NextResponse.json({ panels, styleDescription })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.'
    console.error('[generate error]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
