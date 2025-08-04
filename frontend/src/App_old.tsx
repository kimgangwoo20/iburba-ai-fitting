import React, { useState } from 'react';
import './App.css';

interface VirtualTryonResponse {
  success: boolean;
  result_image?: string;
  message?: string;
  error?: string;
  debug_info?: any;
  processing_time?: number;
  job_id?: string;
  is_test_mode?: boolean;
}

function App() {
  const [personImage, setPersonImage] = useState<File | null>(null);
  const [garmentImage, setGarmentImage] = useState<File | null>(null);
  const [personImagePreview, setPersonImagePreview] = useState<string | null>(null);
  const [garmentImagePreview, setGarmentImagePreview] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showComparison, setShowComparison] = useState(false);

  const handleTryon = async () => {
    if (!personImage || !garmentImage) {
      setError('인물 사진과 의상 사진을 모두 업로드해주세요.');
      return;
    }
    
    setLoading(true);
    setError('');
    setMessage('가상 피팅을 시작합니다...');
    setResultImage(null);
    setShowComparison(false);

    try {
      console.log('🚀 가상 피팅 시작');
      
      const personBase64 = await fileToBase64(personImage);
      const garmentBase64 = await fileToBase64(garmentImage);
      
      console.log('📤 이미지 변환 완료, API 호출 중...');
      setMessage('이미지 처리 중...');
      
      const response = await fetch('http://localhost:8000/api/v1/virtual-tryon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person_image: `data:image/jpeg;base64,${personBase64}`,
          garment_image: `data:image/jpeg;base64,${garmentBase64}`
        })
      });
      
      console.log('📥 응답 상태:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data: VirtualTryonResponse = await response.json();
      console.log('📥 백엔드 응답:', data);

      if (data.success && data.result_image) {
        console.log('✅ 가상 피팅 성공!');
        console.log('결과 이미지 URL:', data.result_image);
        
        setResultImage(data.result_image);
        setMessage(data.message || '가상 피팅이 완료되었습니다!');
        setShowComparison(true); // 비교 뷰 활성화
        
        if (data.processing_time) {
          setMessage(prev => `${prev} (처리 시간: ${data.processing_time}초)`);
        }
        
        if (data.is_test_mode) {
          setMessage(prev => `${prev} [개발 모드]`);
        }
        
      } else {
        console.error('❌ 가상 피팅 실패:', data);
        setError(data.error || data.message || '가상 피팅에 실패했습니다.');
        
        if (data.debug_info) {
          console.log('디버그 정보:', data.debug_info);
        }
      }

    } catch (err: any) {
      console.error('🚨 API 호출 오류:', err);
      setError(`네트워크 오류: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePersonImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPersonImage(file);
      
      // 미리보기 생성
      const reader = new FileReader();
      reader.onload = (e) => {
        setPersonImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      
      console.log('인물 사진 선택:', file.name);
    }
  };

  const handleGarmentImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setGarmentImage(file);
      
      // 미리보기 생성
      const reader = new FileReader();
      reader.onload = (e) => {
        setGarmentImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      
      console.log('의상 사진 선택:', file.name);
    }
  };

  const resetAll = () => {
    setPersonImage(null);
    setGarmentImage(null);
    setPersonImagePreview(null);
    setGarmentImagePreview(null);
    setResultImage(null);
    setShowComparison(false);
    setMessage('');
    setError('');
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center', maxWidth: '1400px', margin: '0 auto' }}>
      <h1>🎯 iBurBa AI 가상 피팅</h1>
      
      {!showComparison ? (
        // 업로드 단계
        <>
          <div style={{ display: 'flex', gap: '30px', justifyContent: 'center', margin: '30px 0', flexWrap: 'wrap' }}>
            {/* 인물 사진 업로드 */}
            <div style={{ flex: '1', minWidth: '300px', maxWidth: '400px' }}>
              <h3>👤 인물 사진</h3>
              <div style={{ 
                border: '2px dashed #ddd', 
                borderRadius: '12px', 
                padding: '20px', 
                minHeight: '300px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: personImagePreview ? '#f8f9fa' : '#fafafa',
                borderColor: personImagePreview ? '#10b981' : '#ddd'
              }}>
                {personImagePreview ? (
                  <div style={{ textAlign: 'center' }}>
                    <img 
                      src={personImagePreview} 
                      alt="인물 미리보기" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '250px', 
                        borderRadius: '8px',
                        objectFit: 'cover'
                      }} 
                    />
                    <p style={{ color: '#10b981', margin: '10px 0 5px', fontWeight: 'bold' }}>
                      ✅ 업로드 완료
                    </p>
                    <p style={{ color: '#666', fontSize: '14px' }}>{personImage?.name}</p>
                    <button 
                      onClick={() => {
                        setPersonImage(null);
                        setPersonImagePreview(null);
                      }}
                      style={{ 
                        background: '#ef4444', 
                        color: 'white', 
                        border: 'none', 
                        padding: '5px 10px', 
                        borderRadius: '4px',
                        fontSize: '12px',
                        marginTop: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '48px', marginBottom: '15px', opacity: 0.6 }}>👤</div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handlePersonImageChange}
                      style={{ display: 'none' }}
                      id="person-input"
                    />
                    <label 
                      htmlFor="person-input"
                      style={{ 
                        background: '#3b82f6', 
                        color: 'white', 
                        padding: '12px 24px', 
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-block',
                        fontWeight: 'bold'
                      }}
                    >
                      📁 사진 선택
                    </label>
                    <p style={{ color: '#666', fontSize: '14px', marginTop: '10px' }}>
                      정면을 바라보는 전신 사진 권장
                    </p>
                  </div>
                )}
              </div>
            </div>
            
            {/* 의상 사진 업로드 */}
            <div style={{ flex: '1', minWidth: '300px', maxWidth: '400px' }}>
              <h3>👕 의상 사진</h3>
              <div style={{ 
                border: '2px dashed #ddd', 
                borderRadius: '12px', 
                padding: '20px', 
                minHeight: '300px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: garmentImagePreview ? '#f8f9fa' : '#fafafa',
                borderColor: garmentImagePreview ? '#10b981' : '#ddd'
              }}>
                {garmentImagePreview ? (
                  <div style={{ textAlign: 'center' }}>
                    <img 
                      src={garmentImagePreview} 
                      alt="의상 미리보기" 
                      style={{ 
                        maxWidth: '100%', 
                        maxHeight: '250px', 
                        borderRadius: '8px',
                        objectFit: 'cover'
                      }} 
                    />
                    <p style={{ color: '#10b981', margin: '10px 0 5px', fontWeight: 'bold' }}>
                      ✅ 업로드 완료
                    </p>
                    <p style={{ color: '#666', fontSize: '14px' }}>{garmentImage?.name}</p>
                    <button 
                      onClick={() => {
                        setGarmentImage(null);
                        setGarmentImagePreview(null);
                      }}
                      style={{ 
                        background: '#ef4444', 
                        color: 'white', 
                        border: 'none', 
                        padding: '5px 10px', 
                        borderRadius: '4px',
                        fontSize: '12px',
                        marginTop: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '48px', marginBottom: '15px', opacity: 0.6 }}>👕</div>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={handleGarmentImageChange}
                      style={{ display: 'none' }}
                      id="garment-input"
                    />
                    <label 
                      htmlFor="garment-input"
                      style={{ 
                        background: '#10b981', 
                        color: 'white', 
                        padding: '12px 24px', 
                        borderRadius: '8px',
                        cursor: 'pointer',
                        display: 'inline-block',
                        fontWeight: 'bold'
                      }}
                    >
                      📁 사진 선택
                    </label>
                    <p style={{ color: '#666', fontSize: '14px', marginTop: '10px' }}>
                      상의, 하의, 드레스 등
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleTryon}
            disabled={!personImage || !garmentImage || loading}
            style={{ 
              padding: '15px 40px', 
              fontSize: '18px',
              backgroundColor: !personImage || !garmentImage || loading ? '#ccc' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              cursor: !personImage || !garmentImage || loading ? 'not-allowed' : 'pointer',
              margin: '20px 0',
              fontWeight: 'bold',
              background: !personImage || !garmentImage || loading ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            }}
          >
            {loading ? '🔄 AI 처리 중...' : '🎯 가상 피팅 시작'}
          </button>
        </>
      ) : (
        // 결과 비교 단계
        <div style={{ marginTop: '30px' }}>
          <h2>✨ 가상 피팅 결과</h2>
          
          {/* 3-Panel 비교 레이아웃 */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '20px',
            marginTop: '30px',
            maxWidth: '1200px',
            margin: '30px auto'
          }}>
            {/* 원본 인물 사진 */}
            <div style={{ 
              background: 'white', 
              padding: '20px', 
              borderRadius: '12px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              textAlign: 'center'
            }}>
              <h3 style={{ color: '#3b82f6', marginBottom: '15px' }}>👤 원본 인물</h3>
              {personImagePreview && (
                <img 
                  src={personImagePreview} 
                  alt="원본 인물 사진" 
                  style={{ 
                    width: '100%', 
                    maxHeight: '350px', 
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '2px solid #e5e7eb'
                  }} 
                />
              )}
              <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '10px' }}>
                내가 업로드한 사진
              </p>
            </div>
            
            {/* 선택한 의상 */}
            <div style={{ 
              background: 'white', 
              padding: '20px', 
              borderRadius: '12px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              textAlign: 'center'
            }}>
              <h3 style={{ color: '#10b981', marginBottom: '15px' }}>👕 선택 의상</h3>
              {garmentImagePreview && (
                <img 
                  src={garmentImagePreview} 
                  alt="선택한 의상" 
                  style={{ 
                    width: '100%', 
                    maxHeight: '350px', 
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '2px solid #e5e7eb'
                  }} 
                />
              )}
              <p style={{ color: '#6b7280', fontSize: '14px', marginTop: '10px' }}>
                입어보고 싶은 옷
              </p>
            </div>
            
            {/* 가상 피팅 결과 */}
            <div style={{ 
              background: 'white', 
              padding: '20px', 
              borderRadius: '12px',
              boxShadow: '0 8px 25px rgba(102, 126, 234, 0.15)',
              textAlign: 'center',
              border: '2px solid #667eea'
            }}>
              <h3 style={{ color: '#667eea', marginBottom: '15px' }}>✨ AI 피팅 결과</h3>
              {resultImage && (
                <img 
                  src={resultImage} 
                  alt="가상 피팅 결과" 
                  style={{ 
                    width: '100%', 
                    maxHeight: '350px', 
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '2px solid #667eea'
                  }}
                  onLoad={() => console.log('✅ 결과 이미지 로드 완료')}
                  onError={(e) => {
                    console.error('❌ 이미지 로드 실패:', resultImage);
                    setError('결과 이미지를 로드할 수 없습니다.');
                  }}
                />
              )}
              <p style={{ color: '#667eea', fontSize: '14px', marginTop: '10px', fontWeight: 'bold' }}>
                🎉 가상 피팅 완료!
              </p>
            </div>
          </div>
          
          {/* 액션 버튼들 */}
          <div style={{ 
            display: 'flex', 
            gap: '15px', 
            justifyContent: 'center', 
            margin: '30px 0',
            flexWrap: 'wrap'
          }}>
            <button 
              onClick={() => resultImage && window.open(resultImage, '_blank')}
              disabled={!resultImage}
              style={{ 
                background: resultImage ? '#10b981' : '#ccc', 
                color: 'white', 
                border: 'none', 
                padding: '12px 24px', 
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: resultImage ? 'pointer' : 'not-allowed'
              }}
            >
              🔗 새 탭에서 보기
            </button>
            
            <button 
              onClick={() => {
                if (resultImage) {
                  const link = document.createElement('a');
                  link.href = resultImage;
                  link.download = 'iburba-result.png';
                  link.click();
                }
              }}
              disabled={!resultImage}
              style={{ 
                background: resultImage ? '#3b82f6' : '#ccc', 
                color: 'white', 
                border: 'none', 
                padding: '12px 24px', 
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: resultImage ? 'pointer' : 'not-allowed'
              }}
            >
              💾 결과 저장
            </button>
            
            <button 
              onClick={resetAll}
              style={{ 
                background: '#6b7280', 
                color: 'white', 
                border: 'none', 
                padding: '12px 24px', 
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              🔄 다시 시도
            </button>
          </div>
        </div>
      )}
      
      {/* 메시지 표시 */}
      {message && (
        <div style={{ 
          backgroundColor: '#dbeafe', 
          border: '1px solid #3b82f6', 
          color: '#1d4ed8', 
          padding: '12px', 
          borderRadius: '8px',
          margin: '10px 0'
        }}>
          {message}
        </div>
      )}

      {/* 에러 표시 */}
      {error && (
        <div style={{ 
          backgroundColor: '#fef2f2', 
          border: '1px solid #f87171', 
          color: '#dc2626', 
          padding: '12px', 
          borderRadius: '8px',
          margin: '10px 0'
        }}>
          <strong>오류:</strong> {error}
        </div>
      )}

      {/* 디버깅 정보 */}
      <div style={{ 
        marginTop: '30px', 
        padding: '15px', 
        backgroundColor: '#f3f4f6', 
        borderRadius: '8px',
        fontSize: '14px',
        color: '#4b5563',
        textAlign: 'left'
      }}>
        <p><strong>상태 정보:</strong></p>
        <p>• 인물 사진: {personImage ? `✅ ${personImage.name}` : '❌ 미선택'}</p>
        <p>• 의상 사진: {garmentImage ? `✅ ${garmentImage.name}` : '❌ 미선택'}</p>
        <p>• 처리 상태: {loading ? '🔄 처리 중' : '⏸️ 대기 중'}</p>
        <p>• 비교 모드: {showComparison ? '✅ 활성' : '❌ 비활성'}</p>
      </div>
    </div>
  );
}

export default App;