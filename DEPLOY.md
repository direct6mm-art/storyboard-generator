# 배포 가이드 (비개발자용)

## 준비물
- GitHub 계정 (github.com)
- Vercel 계정 (vercel.com) — GitHub으로 로그인 가능
- Anthropic API 키 (console.anthropic.com)

---

## 1단계 — GitHub에 코드 올리기

1. github.com 접속 → 로그인
2. 우측 상단 `+` 버튼 → **New repository**
3. Repository name: `storyboard-generator` → **Create repository**
4. 화면에 나오는 안내 중 "upload an existing file" 클릭
5. 이 폴더(storyboard-generator) 안의 **모든 파일**을 드래그하여 업로드
   - `.env` 파일은 업로드하지 마세요 (보안)
6. **Commit changes** 클릭

---

## 2단계 — Vercel에 배포하기

1. vercel.com 접속 → **GitHub으로 로그인**
2. **Add New Project** 클릭
3. GitHub 저장소 목록에서 `storyboard-generator` 선택 → **Import**
4. **Environment Variables** 섹션에서:
   - `ANTHROPIC_API_KEY` 입력란에 API 키 붙여넣기
5. **Deploy** 클릭

약 2분 후 배포 완료 → 생성된 URL로 누구나 접속 가능

---

## 3단계 — Anthropic API 키 발급

1. console.anthropic.com 접속 → 회원가입
2. 좌측 메뉴 **API Keys** → **Create Key**
3. 키 복사 → Vercel 환경변수에 붙여넣기

> 비용: Claude API는 사용한 토큰만큼 과금
> 스토리보드 1회 생성 기준 약 $0.01~0.03 (10~30원) 수준

---

## 로컬에서 테스트하려면

```bash
# 1. 이 폴더에서 터미널 열기
npm install

# 2. .env.local 파일 만들기
echo "ANTHROPIC_API_KEY=sk-ant-여기에키입력" > .env.local

# 3. 실행
npm run dev

# 4. 브라우저에서 http://localhost:3000 접속
```
