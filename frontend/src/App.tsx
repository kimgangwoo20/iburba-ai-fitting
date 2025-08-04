import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_BASE_URL = 'http://localhost:8000';

interface VirtualTryonResponse {
  success: boolean;
  result_image?: string;
  processing_time?: number;
  cost?: number;
  remaining_usage?: number;
  error?: string;
}

const App: React.FC = () => {
  // 🔥 파일 상태 - 단순하게
  const [personFile, setPersonFile] = useState<File | null>(null);
  const [garmentFile, setGarmentFile] = useState<File | null>(null);
  
  // 🔥 DOM 직접 참조
  const personInputRef = useRef<HTMLInputElement>(null);
  const garmentInputRef = useRef<HTMLInputElement>(null);
  
  // UI 상태
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [hasExecuted, setHasExecuted] = useState(false); // 🔥 실행 여부 추적

  // 파일을 Base64로 변환
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1]; // data:image/jpeg;base64, 부분 제거
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // 🎯 가상 피팅 실행
  const handleVirtualTryon = async () => {
    if (!personFile || !garmentFile) {
      alert('인물 사진과 의상 사진을 모두 선택해주세요.');
      return;
    }

    console.log('🚀 가상 피팅 시작...');
    
    setLoading(true);
    setProgress(0);
    setResult(null);
    setHasExecuted(true); // 🔥 실행됨 표시

    try {
      // 파일을 Base64로 변환
      console.log('📸 파일 변환 중...');
      const [personBase64, garmentBase64] = await Promise.all([
        fileToBase64(personFile),
        fileToBase64(garmentFile)
      ]);

      console.log('🔗 API 호출 중...');
      
      // API 호출
      const response = await axios.post<VirtualTryonResponse>(
        `${API_BASE_URL}/virtual-tryon`,
        {
          person_image: personBase64,
          garment_image: garmentBase64
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 120000 // 2분 타임아웃
        }
      );

      console.log('📡 API 응답:', response.data);

      if (response.data.success && response.data.result_image) {
        console.log('✅ 가상 피팅 성공!');
        setResult(response.data.result_image);
        setProgress(100);
        
        // 결과 새 탭에서 열기
        setTimeout(() => {
          const newWindow = window.open('', '_blank');
          if (newWindow) {
            newWindow.document.write(`
              <html>
                <head><title>🎯 iBurBa 가상 피팅 결과</title></head>
                <body style="margin:0; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f0f0f0;">
                  <div style="text-align:center;">
                    <h2>✨ iBurBa 가상 피팅 결과</h2>
                    <img src="${response.data.result_image}" style="max-width:90vw; max-height:80vh; border-radius:10px; box-shadow:0 10px 30px rgba(0,0,0,0.3);" />
                    <p style="margin-top:20px; color:#666;">처리 시간: ${response.data.processing_time?.toFixed(1) || 'N/A'}초</p>
                    <p style="color:#666;">비용: $${response.data.cost || 'N/A'}</p>
                    <button onclick="window.close()" style="margin-top:10px; padding:10px 20px; background:#22c55e; color:white; border:none; border-radius:5px; cursor:pointer;">창 닫기</button>
                  </div>
                </body>
              </html>
            `);
          }
        }, 500);
        
      } else {
        console.error('❌ 가상 피팅 실패:', response.data.error);
        alert(response.data.error || '알 수 없는 오류가 발생했습니다.');
      }
      
    } catch (error: any) {
      console.error('💥 가상 피팅 오류:', error);
      
      if (error.response?.data?.error) {
        alert(`오류: ${error.response.data.error}`);
      } else if (error.message) {
        alert(`오류: ${error.message}`);
      } else {
        alert('가상 피팅 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }
    
    setLoading(false);
  };

  // 🔥 3초 자동 실행 (단순화 + 무한루프 방지)
  useEffect(() => {
    if (personFile && garmentFile && !loading && !hasExecuted) {
      console.log('⏰ 두 파일 모두 선택됨 - 3초 후 자동 실행');
      
      const timer = setTimeout(() => {
        console.log('🎯 자동 가상 피팅 실행!');
        handleVirtualTryon();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [personFile, garmentFile, loading, hasExecuted]); // 🔥 hasExecuted 추가

  // 초기화
  const handleReset = () => {
    setPersonFile(null);
    setGarmentFile(null);
    setResult(null);
    setProgress(0);
    setHasExecuted(false); // 🔥 실행 상태 리셋
    
    // DOM 직접 초기화
    if (personInputRef.current) personInputRef.current.value = '';
    if (garmentInputRef.current) garmentInputRef.current.value = '';
    
    console.log('🔄 전체 초기화 완료');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-blue-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🎯 iBurBa AI 가상 피팅</h1>
          <p className="text-gray-600">두 사진을 선택하면 3초 후 자동으로 실행됩니다</p>
        </div>

        {/* 자동 실행 표시 */}
        {personFile && garmentFile && !loading && !hasExecuted && (
          <div className="mb-6 bg-orange-100 border border-orange-400 text-orange-700 px-4 py-3 rounded text-center">
            ⏰ 3초 후 자동으로 가상 피팅이 시작됩니다...
          </div>
        )}

        {/* 완료 후 안내 */}
        {hasExecuted && result && (
          <div className="mb-6 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded text-center">
            ✅ 가상 피팅이 완료되었습니다! 새 이미지로 다시 시도하려면 "초기화" 버튼을 눌러주세요.
          </div>
        )}

        {/* 실행 실패 후 안내 */}
        {hasExecuted && !result && !loading && (
          <div className="mb-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-center">
            ❌ 가상 피팅에 실패했습니다. "초기화" 후 다시 시도해주세요.
          </div>
        )}

        {/* 메인 컨텐츠 */}
        <div className="grid lg:grid-cols-3 gap-8">
          {/* 이미지 업로드 */}
          <div className="lg:col-span-2">
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* 인물 사진 */}
              <div className="bg-white rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-semibold mb-4 text-center">👤 인물 사진</h3>
                
                <input
                  ref={personInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    console.log('👤 인물 파일 선택:', file?.name);
                    setPersonFile(file);
                  }}
                  className="w-full mb-4 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                />
                
                {personFile ? (
                  <div className="text-center">
                    <img 
                      src={URL.createObjectURL(personFile)} 
                      alt="인물 사진" 
                      className="max-w-full max-h-64 mx-auto rounded-lg mb-4 object-cover shadow-md"
                    />
                    <p className="text-emerald-600 font-medium">✅ {personFile.name}</p>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                    <div className="text-6xl mb-4">👤</div>
                    <p className="text-gray-600">인물 사진을 선택하세요</p>
                  </div>
                )}
              </div>

              {/* 의상 사진 */}
              <div className="bg-white rounded-2xl p-6 shadow-lg">
                <h3 className="text-xl font-semibold mb-4 text-center">👕 의상 사진</h3>
                
                <input
                  ref={garmentInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    console.log('👕 의상 파일 선택:', file?.name);
                    setGarmentFile(file);
                  }}
                  className="w-full mb-4 text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                />
                
                {garmentFile ? (
                  <div className="text-center">
                    <img 
                      src={URL.createObjectURL(garmentFile)} 
                      alt="의상 사진" 
                      className="max-w-full max-h-64 mx-auto rounded-lg mb-4 object-cover shadow-md"
                    />
                    <p className="text-emerald-600 font-medium">✅ {garmentFile.name}</p>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                    <div className="text-6xl mb-4">👕</div>
                    <p className="text-gray-600">의상 사진을 선택하세요</p>
                  </div>
                )}
              </div>
            </div>

            {/* 실행 버튼 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg text-center">
              {loading ? (
                <div className="space-y-4">
                  <div className="text-2xl animate-pulse">🔄</div>
                  <h3 className="text-xl font-semibold text-emerald-600">AI 가상 피팅 처리 중...</h3>
                  <p className="text-sm text-gray-600">FASHN API로 처리 중입니다 (최대 60초)</p>
                </div>
              ) : hasExecuted ? (
                <div className="space-y-4">
                  <div className="text-2xl">{result ? '✅' : '❌'}</div>
                  <h3 className="text-xl font-semibold text-gray-600">
                    {result ? '가상 피팅 완료!' : '가상 피팅 실패'}
                  </h3>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={handleReset}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-medium"
                    >
                      🔄 새로운 피팅 시작
                    </button>
                    {result && (
                      <button
                        onClick={() => window.open(result, '_blank')}
                        className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium"
                      >
                        🖼️ 결과 크게 보기
                      </button>
                    )}
                  </div>
                </div>
              ) : personFile && garmentFile ? (
                <div className="space-y-4">
                  <div className="text-2xl">🎯</div>
                  <h3 className="text-xl font-semibold text-emerald-600">준비 완료!</h3>
                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={handleVirtualTryon}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-medium"
                    >
                      🚀 지금 바로 실행
                    </button>
                    <button
                      onClick={handleReset}
                      className="bg-gray-500 hover:bg-gray-600 text-white px-8 py-3 rounded-lg font-medium"
                    >
                      🔄 초기화
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-2xl">📸</div>
                  <h3 className="text-lg font-medium text-gray-600">두 사진을 모두 선택해주세요</h3>
                </div>
              )}
            </div>
          </div>

          {/* 결과 표시 */}
          <div className="bg-white rounded-2xl p-6 shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-center">✨ 피팅 결과</h3>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center min-h-96 flex items-center justify-center">
              {result ? (
                <div>
                  <img 
                    src={result} 
                    alt="가상 피팅 결과" 
                    className="max-w-full rounded-lg shadow-lg mb-4"
                  />
                  <div className="space-y-2">
                    <button
                      onClick={() => window.open(result, '_blank')}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm mr-2"
                    >
                      🔍 크게 보기
                    </button>
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = result;
                        link.download = 'iburba-result.png';
                        link.click();
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                    >
                      💾 다운로드
                    </button>
                  </div>
                </div>
              ) : loading ? (
                <div className="text-center">
                  <div className="animate-spin text-4xl mb-4">🔄</div>
                  <p className="text-gray-600">FASHN AI가 작업 중...</p>
                </div>
              ) : (
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-4">✨</div>
                  <p>가상 피팅 결과가 여기에 표시됩니다</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 사용법 */}
        <div className="mt-12 bg-white rounded-2xl p-6 shadow-lg">
          <h3 className="text-xl font-semibold mb-4 text-center">📝 사용법</h3>
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-3xl mb-2">1️⃣</div>
              <h4 className="font-medium mb-2">인물 사진 선택</h4>
              <p className="text-sm text-gray-600">전신이 나온 인물 사진</p>
            </div>
            <div>
              <div className="text-3xl mb-2">2️⃣</div>
              <h4 className="font-medium mb-2">의상 사진 선택</h4>
              <p className="text-sm text-gray-600">피팅할 의상 사진</p>
            </div>
            <div>
              <div className="text-3xl mb-2">3️⃣</div>
              <h4 className="font-medium mb-2">자동 실행</h4>
              <p className="text-sm text-gray-600">3초 후 자동 실행</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;