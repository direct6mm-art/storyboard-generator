import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '스토리보드 생성기',
  description: 'AI가 시나리오를 분석해 스토리보드를 자동으로 생성합니다.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
