// frontend/src/App.tsx - 인증이 통합된 React 앱
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// 타입 정의
interface User {
  id: number;
  email: string;
  plan: string;
  daily_usage: number;
}

interface AuthResponse {
  access_token: string;
  token_type: string;
  plan: string;
  daily_usage: number;
}

interface VirtualTryonResponse {
  success: boolean;
  result_image?: string;
  processing_time?: number;
  cost?: number;
  remaining_usage?: number;
  error?: string;
}

interface PricingPlan {
  name: string;
  price: number;
  daily_limit: number;
  features: string[];
}

const API_BASE = 'http://localhost:8000/api/v1';

// Axios 기본 설정
const apiClient = axios.create({
  baseURL: API_BASE,
});

// 토큰 인터셉터 설정
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const App: React.FC = () => {
  // 상태 관리
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentView, setCurrentView] = useState<'login' | 'register' | 'main'>('login');
  
  // 가상 피팅 상태
  const [personImage, setPersonImage] = useState<File | null>(null);
  const [garmentImage, setGarmentImage] = useState<File | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  
  // 요금제 상태
  const [pricingPlans, setPricingPlans] = useState<Record<string, PricingPlan>>({});

  // 컴포넌트 마운트 시 토큰 확인
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchCurrentUser();
    }
    fetchPricingPlans();
  }, []);

  // 현재 사용자 정보 가져오기
  const fetchCurrentUser = async () => {
    try {
      const response = await apiClient.get('/auth/me');
      setUser(response.data);
      setCurrentView('main');
    } catch (error) {
      console.log('fetchCurrentUser error:', error);
      // localStorage.removeItem('token'); // 주석 처리
      // setCurrentView('login'); // 주석 처리
    }
  };

  // 요금제 정보 가져오기
  const fetchPricingPlans = async () => {
    try {
      const response = await apiClient.get('/pricing');
      setPricingPlans(response.data.plans);
    } catch (error) {
      console.error('요금제 정보 로드 실패:', error);
    }
  };

  // 로그인 처리
  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    try {
      const response = await apiClient.post<AuthResponse>('/auth/login', {
        email,
        password
      });
      
      const { access_token, plan, daily_usage } = response.data;
      localStorage.setItem('token', access_token);
      
      setUser({ id: 0, email, plan, daily_usage });
      setCurrentView('main');
      
      // 사용자 정보 재조회
      fetchCurrentUser();
    } catch (error: any) {
      alert(error.response?.data?.detail || '로그인 실패');
    }
    setLoading(false);
  };

  // 회원가입 처리
  const handleRegister = async (email: string, password: string, plan: string = 'free') => {
    setLoading(true);
    try {
      const response = await apiClient.post<AuthResponse>('/auth/register', {
        email,
        password,
        plan
      });
      
      const { access_token } = response.data;
      localStorage.setItem('token', access_token);
      
      setUser({ id: 0, email, plan, daily_usage: 0 });
      setCurrentView('main');
      
      // 사용자 정보 재조회
      fetchCurrentUser();
    } catch (error: any) {
      alert(error.response?.data?.detail || '회원가입 실패');
    }
    setLoading(false);
  };

  // 로그아웃 처리
  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setCurrentView('login');
    setResult(null);
    setPersonImage(null);
    setGarmentImage(null);
  };

  // 파일을 base64로 변환
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // data:image/jpeg;base64, 부분 제거
      };
      reader.onerror = error => reject(error);
    });
  };

  // 가상 피팅 처리
  const handleVirtualTryon = async () => {
    if (!personImage || !garmentImage) {
      alert('인물 사진과 의상 사진을 모두 업로드해주세요.');
      return;
    }

    setLoading(true);
    try {
      const personBase64 = await fileToBase64(personImage);
      const garmentBase64 = await fileToBase64(garmentImage);

      const response = await apiClient.post<VirtualTryonResponse>('/virtual-tryon', {
        person_image: personBase64,
        garment_image: garmentBase64,
        quality: 'standard'
      });

      if (response.data.success) {
        setResult(response.data.result_image || '');
        setProcessingTime(response.data.processing_time || 0);
        
        // 사용자 정보 업데이트 (사용량 반영)
        if (user) {
          setUser({
            ...user,
            daily_usage: user.daily_usage + 1
          });
        }
      } else {
        alert(response.data.error || '가상 피팅 실패');
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || '가상 피팅 오류');
    }
    setLoading(false);
  };

  // 로그인 폼 컴포넌트
  const LoginForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800">🎯 iBurBa</h1>
            <p className="text-gray-600 mt-2">AI 가상 피팅 플랫폼</p>
          </div>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={() => handleLogin(email, password)}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              계정이 없으신가요?{' '}
              <button
                onClick={() => setCurrentView('register')}
                className="text-emerald-600 hover:underline"
              >
                회원가입
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  };

  // 회원가입 폼 컴포넌트
  const RegisterForm: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [selectedPlan, setSelectedPlan] = useState('free');

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800">🎯 iBurBa 회원가입</h1>
            <p className="text-gray-600 mt-2">요금제를 선택하고 시작하세요</p>
          </div>

          {/* 요금제 선택 */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {Object.entries(pricingPlans).map(([key, plan]) => (
              <div
                key={key}
                onClick={() => setSelectedPlan(key)}
                className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                  selectedPlan === key
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 hover:border-emerald-300'
                }`}
              >
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <p className="text-2xl font-bold text-emerald-600">
                  {plan.price === 0 ? '무료' : `$${plan.price}/월`}
                </p>
                <ul className="text-sm text-gray-600 mt-2">
                  {plan.features.map((feature, index) => (
                    <li key={index}>• {feature}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={() => handleRegister(email, password, selectedPlan)}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-medium disabled:opacity-50"
            >
              {loading ? '가입 중...' : '회원가입'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-gray-600">
              이미 계정이 있으신가요?{' '}
              <button
                onClick={() => setCurrentView('login')}
                className="text-emerald-600 hover:underline"
              >
                로그인
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  };

  // 메인 앱 컴포넌트
  const MainApp: React.FC = () => {
    const currentPlan = user ? pricingPlans[user.plan] : null;
    const remainingUsage = currentPlan && currentPlan.daily_limit !== -1 
      ? currentPlan.daily_limit - (user?.daily_usage || 0)
      : -1;

    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 p-8">
        <div className="max-w-6xl mx-auto">
          {/* 헤더 */}
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800">🎯 iBurBa AI 가상 피팅</h1>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-600">{user?.email}</p>
                <p className="text-sm font-medium">
                  {currentPlan?.name} 플랜 
                  {remainingUsage !== -1 && (
                    <span className="text-emerald-600"> ({remainingUsage}회 남음)</span>
                  )}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg"
              >
                로그아웃
              </button>
            </div>
          </div>

          {/* 사용량 경고 */}
          {remainingUsage !== -1 && remainingUsage <= 1 && (
            <div className="bg-orange-100 border border-orange-400 text-orange-700 px-4 py-3 rounded mb-6">
              ⚠️ 일일 사용량이 거의 소진되었습니다. 플랜 업그레이드를 고려해보세요.
            </div>
          )}

          {/* 이미지 업로드 섹션 */}
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">👤 인물 사진</h2>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPersonImage(e.target.files?.[0] || null)}
                className="w-full mb-4"
              />
              {personImage && (
                <img
                  src={URL.createObjectURL(personImage)}
                  alt="인물 사진"
                  className="w-full h-64 object-cover rounded-lg"
                />
              )}
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-bold mb-4">👕 의상 사진</h2>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setGarmentImage(e.target.files?.[0] || null)}
                className="w-full mb-4"
              />
              {garmentImage && (
                <img
                  src={URL.createObjectURL(garmentImage)}
                  alt="의상 사진"
                  className="w-full h-64 object-cover rounded-lg"
                />
              )}
            </div>
          </div>

          {/* 가상 피팅 버튼 */}
          <div className="text-center mb-8">
            <button
              onClick={handleVirtualTryon}
              disabled={!personImage || !garmentImage || loading || (remainingUsage === 0)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-lg text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '🔄 처리 중...' : '🎯 가상 피팅 시작'}
            </button>
            {remainingUsage === 0 && (
              <p className="text-red-500 mt-2">일일 사용량을 초과했습니다. 플랜을 업그레이드하세요.</p>
            )}
          </div>

          {/* 결과 표시 */}
          {result && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="text-center mb-4">
                <h2 className="text-2xl font-bold text-gray-800">✨ 피팅 결과</h2>
                {processingTime && (
                  <p className="text-gray-600">처리 시간: {processingTime.toFixed(1)}초</p>
                )}
              </div>
              <div className="flex justify-center">
                <img
                  src={result}
                  alt="피팅 결과"
                  className="max-w-md rounded-lg shadow-lg"
                />
              </div>
              <div className="text-center mt-4">
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = result;
                    link.download = 'iburba-result.png';
                    link.click();
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg mr-4"
                >
                  💾 다운로드
                </button>
                <button
                  onClick={() => setResult(null)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg"
                >
                  🔄 다시 시도
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // 렌더링
  if (currentView === 'login') {
    return <LoginForm />;
  } else if (currentView === 'register') {
    return <RegisterForm />;
  } else {
    return <MainApp />;
  }
};

export default App;