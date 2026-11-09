// ─────────────────────────────────────────────────────────────
//  BRAND CINEMA 설정 파일 — 이 파일만 고치면 문구·영상이 바뀝니다
// ─────────────────────────────────────────────────────────────
window.THEATER_CONFIG = {
  brand: {
    logo: 'brand/hauterre-logo.png',              // 오티에르 로고 (흰색 투명 PNG)
    title: 'HAUTERRE BRAND CINEMA',               // 브라우저 탭·로딩 문구
    subtitle: 'POSCO E&C 브랜드전략섹션',          // 부제
    marquee: 'BRAND CINEMA',                      // 무대 전광판 아래 문구
    marqueeSub: 'POSCO E&C PRESENTS',             // 무대 전광판 위 문구
    welcome: '자리를 찾아 앉으면, 곧 상영이 시작됩니다',
  },

  // 기본 상영 목록 — 보통은 관리자 화면(/admin)에서 영상을 올리면 그 목록이 우선 적용됩니다.
  // (관리자 화면을 한 번도 저장하지 않았을 때만 아래 목록을 사용)
  // 예) Hugging Face Dataset 에 올린 영상:
  //   { src: 'https://huggingface.co/datasets/아이디/hauterre-videos/resolve/main/concert.mp4', title: '오티에르 집콘서트' },
  playlist: [
    { src: 'media/feature.mp4', title: '데모 상영 · 브랜드 홍보영상 자리' },
  ],

  intermission: 20,                 // 상영 사이 인터미션(초) — 커튼이 닫히고 조명쇼
  epoch: '2026-01-01T00:00:00+09:00', // 상영 시간표 기준점(모든 관객이 같은 장면을 보도록)

  // 상영이 끝나면 뜨는 안내 카드 (브랜드 행동 유도). 링크는 실제 주소로 바꿔 주세요.
  cta: {
    title: '오티에르의 다음 이야기를 만나보세요',
    desc: '하이엔드 주거의 새로운 기준, HAUTERRE',
    buttons: [
      { label: 'HAUTERRE 오티에르 홈페이지', url: 'https://hauterre.co.kr/' },
      // { label: '분양 정보 보기', url: 'https://...' },
    ],
  },
  shareUrl: '',   // 공유하기 버튼이 복사할 주소 (비우면 현재 주소)

  // 실시간 서버 주소: 'auto' = 이 페이지를 띄운 서버의 /ws 로 접속
  //                   'off'  = 혼자 보는 미리보기 모드
  //                   'wss://example.com/ws' = 별도 서버
  server: 'auto',

  // 말풍선 프리셋 (자유 채팅 없이 정해진 말만 — 공개 공간 욕설·개인정보 걱정 없음). 최대 12개
  phrases: ['안녕하세요! 👋', '와, 멋지다 ✨', '최고예요 👏', '같이 봐요!', '앵콜! 앵콜!', '여기 자리 있어요?',
            '감동이에요 🥹', '브랜드 짱 💛', '팝콘 먹을 사람 🍿', '응원봉 흔들어요!', '또 올게요', '고마워요!'],

  // 관객 색상 (응원봉 색도 이 색으로 빛납니다)
  colors: ['#e2b45a', '#e5484d', '#f27a3b', '#3fb37f', '#3aa0e8', '#7b6cf6', '#e45fa8', '#f4f0e6'],
};
