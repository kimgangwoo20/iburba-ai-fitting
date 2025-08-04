from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests
import asyncio
import json
import base64
import io
from datetime import datetime
from typing import Optional
from PIL import Image

# FastAPI 앱 설정
app = FastAPI(title="iBurBa API", version="1.0.0")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# FASHN API 설정
FASHN_API_KEY = "fa-UFuE1X89MrxW-lSfV2qDzCj0wgU8lUkKbP6En"
FASHN_BASE_URL = "https://api.fashn.ai/v1"
TEST_MODE = False  # 실제 API 사용

# 요청/응답 모델
class VirtualTryonRequest(BaseModel):
    person_image: str  # base64
    garment_image: str  # base64

class VirtualTryonResponse(BaseModel):
    success: bool
    result_image: Optional[str] = None
    processing_time: Optional[float] = None
    cost: Optional[float] = None
    remaining_usage: Optional[int] = None
    error: Optional[str] = None

def preprocess_image(base64_string: str, max_height: int = 1024) -> str:
    """
    🔥 FASHN API 요구사항에 맞게 이미지 전처리
    1. 높이 제한 (1024px 이하)
    2. JPEG 변환 (품질 95)
    3. 파일 크기 최적화
    """
    try:
        # base64 디코딩
        image_data = base64.b64decode(base64_string)
        image = Image.open(io.BytesIO(image_data))
        
        print(f"🖼️ 원본 이미지: {image.size[0]}x{image.size[1]}, 모드: {image.mode}")
        
        # RGB 변환 (JPEG는 RGBA 지원 안 함)
        if image.mode in ('RGBA', 'LA', 'P'):
            # 투명도가 있는 경우 흰색 배경으로 합성
            background = Image.new('RGB', image.size, (255, 255, 255))
            if image.mode == 'P':
                image = image.convert('RGBA')
            background.paste(image, mask=image.split()[-1] if image.mode in ('RGBA', 'LA') else None)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 높이 제한 (aspect ratio 유지)
        if image.size[1] > max_height:
            ratio = max_height / image.size[1]
            new_width = int(image.size[0] * ratio)
            image = image.resize((new_width, max_height), Image.Resampling.LANCZOS)
            print(f"🔄 크기 조정: {new_width}x{max_height}")
        
        # JPEG로 저장 (품질 95)
        buffer = io.BytesIO()
        image.save(buffer, format='JPEG', quality=95, optimize=True)
        
        # base64 인코딩
        processed_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
        
        # 크기 비교
        original_size = len(base64_string) * 3 / 4 / 1024  # KB
        processed_size = len(processed_base64) * 3 / 4 / 1024  # KB
        
        print(f"📦 이미지 최적화: {original_size:.1f}KB → {processed_size:.1f}KB")
        
        return processed_base64
        
    except Exception as e:
        print(f"❌ 이미지 전처리 오류: {str(e)}")
        # 전처리 실패 시 원본 반환
        return base64_string

@app.get("/")
async def root():
    return {
        "message": "🎯 iBurBa API v1.0 - FASHN 연동 (이미지 전처리 추가)",
        "status": "healthy",
        "fashn_api": FASHN_BASE_URL,
        "test_mode": TEST_MODE,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/virtual-tryon")
async def virtual_tryon(request: VirtualTryonRequest):
    """🎯 FASHN API - 이미지 전처리 추가"""
    
    print(f"🎯 가상 피팅 요청 받음 - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"📸 원본 인물 이미지: {len(request.person_image)} chars")
    print(f"👕 원본 의상 이미지: {len(request.garment_image)} chars")
    
    start_time = datetime.now()
    
    if TEST_MODE:
        # 테스트 모드
        print("🔧 테스트 모드 - 3초 지연 후 테스트 이미지 반환")
        await asyncio.sleep(3)
        
        test_images = [
            "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=600&h=800&fit=crop&crop=top",
            "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&h=800&fit=crop&crop=top",
            "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?w=600&h=800&fit=crop&crop=top"
        ]
        
        import random
        selected_image = random.choice(test_images)
        processing_time = (datetime.now() - start_time).total_seconds()
        
        return VirtualTryonResponse(
            success=True,
            result_image=selected_image,
            processing_time=processing_time,
            cost=0.075,
            remaining_usage=94
        )
    
    try:
        print("🔄 이미지 전처리 시작...")
        
        # 🔥 이미지 전처리 (FASHN API 최적화)
        processed_person = preprocess_image(request.person_image, max_height=1024)
        processed_garment = preprocess_image(request.garment_image, max_height=1024)
        
        print(f"✅ 전처리 완료 - 인물: {len(processed_person)} chars, 의상: {len(processed_garment)} chars")
        
        # FASHN API 헤더
        headers = {
            "Authorization": f"Bearer {FASHN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 🔥 FASHN API 요청 (data URL 형식)
        payload = {
            "model_image": f"data:image/jpeg;base64,{processed_person}",       # data URL 형식
            "garment_image": f"data:image/jpeg;base64,{processed_garment}",    # data URL 형식  
            "category": "auto",
            "mode": "balanced",
            "segmentation_free": True,
            "moderation_level": "permissive",
            "garment_photo_type": "auto",
            "seed": 42,
            "num_samples": 1
        }
        
        print(f"🚀 FASHN API /run 요청 전송...")
        
        # 1단계: 예측 시작
        run_response = requests.post(
            f"{FASHN_BASE_URL}/run",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        print(f"📡 /run 응답: {run_response.status_code}")
        
        if run_response.status_code != 200:
            error_msg = f"FASHN API /run 실패: {run_response.status_code} - {run_response.text}"
            print(f"❌ {error_msg}")
            return VirtualTryonResponse(success=False, error=error_msg)
        
        run_result = run_response.json()
        prediction_id = run_result.get("id")
        
        if not prediction_id:
            error_msg = "FASHN API에서 prediction ID를 받지 못했습니다"
            print(f"❌ {error_msg}")
            return VirtualTryonResponse(success=False, error=error_msg)
        
        print(f"✅ Prediction ID: {prediction_id}")
        
        # 2단계: 상태 확인 루프
        max_wait_time = 60
        poll_interval = 3
        elapsed_time = 0
        
        print(f"🔍 상태 확인 시작...")
        
        while elapsed_time < max_wait_time:
            status_response = requests.get(
                f"{FASHN_BASE_URL}/status/{prediction_id}",
                headers=headers,
                timeout=10
            )
            
            if status_response.status_code == 200:
                status_result = status_response.json()
                status = status_result.get("status")
                
                print(f"🔍 상태: {status} ({elapsed_time}초)")
                
                if status == "completed":
                    output = status_result.get("output", [])
                    if output and len(output) > 0:
                        processing_time = (datetime.now() - start_time).total_seconds()
                        
                        print(f"✅ FASHN API 성공! 처리 시간: {processing_time:.1f}초")
                        
                        return VirtualTryonResponse(
                            success=True,
                            result_image=output[0],
                            processing_time=processing_time,
                            cost=0.075,
                            remaining_usage=94
                        )
                    else:
                        error_msg = "결과 이미지를 받지 못했습니다"
                        print(f"❌ {error_msg}")
                        return VirtualTryonResponse(success=False, error=error_msg)
                
                elif status == "failed":
                    error = status_result.get("error", "알 수 없는 오류")
                    error_msg = f"FASHN API 처리 실패: {error}"
                    print(f"❌ {error_msg}")
                    return VirtualTryonResponse(success=False, error=error_msg)
                
                elif status in ["starting", "in_queue", "processing"]:
                    await asyncio.sleep(poll_interval)
                    elapsed_time += poll_interval
                    continue
                
                else:
                    print(f"⚠️ 알 수 없는 상태: {status}")
                    await asyncio.sleep(poll_interval)
                    elapsed_time += poll_interval
                    continue
            
            else:
                print(f"⚠️ 상태 확인 실패: {status_response.status_code}")
                await asyncio.sleep(poll_interval)
                elapsed_time += poll_interval
        
        # 타임아웃
        error_msg = f"처리 타임아웃 ({max_wait_time}초)"
        print(f"⏰ {error_msg}")
        return VirtualTryonResponse(success=False, error=error_msg)
        
    except Exception as e:
        processing_time = (datetime.now() - start_time).total_seconds()
        error_msg = f"처리 오류: {str(e)} ({processing_time:.1f}초)"
        print(f"💥 {error_msg}")
        return VirtualTryonResponse(success=False, error=error_msg)

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "fashn_api": FASHN_BASE_URL,
        "test_mode": TEST_MODE,
        "image_preprocessing": "enabled",
        "timestamp": datetime.now().isoformat()
    }

@app.post("/toggle-test-mode")
async def toggle_test_mode():
    global TEST_MODE
    TEST_MODE = not TEST_MODE
    
    return {
        "message": f"테스트 모드 {'활성화' if TEST_MODE else '비활성화'}",
        "test_mode": TEST_MODE
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 iBurBa API 서버 시작 - 이미지 전처리 추가")
    print(f"🔧 테스트 모드: {TEST_MODE}")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)