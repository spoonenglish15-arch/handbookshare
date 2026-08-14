// Firebase 콘솔 > 프로젝트 설정 > 내 앱 > SDK 설정값 을 아래에 붙여넣으세요.
// Authentication > Google 사용 설정도 켜야 합니다.
window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

// 사용할 3명 구글 계정을 소문자로 넣으세요. 비우면 로그인한 구글 계정은 모두 들어옵니다.
window.FIREBASE_ALLOWED_EMAILS = [
  // 'member1@company.com',
  // 'member2@company.com',
  // 'member3@company.com'
];
