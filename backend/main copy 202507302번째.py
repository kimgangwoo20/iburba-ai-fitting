# backend/main.py - 인증이 통합된 메인 API
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime, timedelta
import requests
import base64
import asyncio
import json
from pydantic import BaseModel

# 인증 모듈 import
from auth import (
    UserCreate, UserLogin, Token, User, PRICING_PLANS,
    create_access_token, create_user, authenticate_user, 
    get_current_user, check_usage_limit, increment_usage,
    check_system_cost_limit, get_daily_usage, ACCESS_TOKEN_EXPIRE_MINUTES
)

app = FastAPI(
    title="iBurBa API",
    description="AI 가상 피팅 플랫폼",
    version="1.0.0"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://iburba.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# FASHN API 설정
FASHN_API_KEY = "fa-UFuE1X89MrxW-lSfV2qDzCj0wgU8lUkKbP6En"
FASHN_API_URL = "https://api.fashn.ai/v1/run"

# 요청 모델
class VirtualTryonRequest(BaseModel):
    person_image: str  # base64
    garment_image: str  # base64
    quality: str = "standard"

# 응답 모델
class VirtualTryonResponse(BaseModel):
    success: bool
    result_image: str = None
    processing_time: float = None
    cost: float = None
    remaining_usage: int = None
    error: str = None

# 🔥 인증 엔드포인트
@app.post("/api/v1/auth/register", response_model=Token)
async def register(user: UserCreate):
    """회원가입"""
    try:
        new_user = create_user(user.email, user.password, user.plan)
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
        data={"sub": str(new_user["id"])},  # 문자열로 변환
        expires_delta=access_token_expires
        )
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "plan": new_user["plan"],
            "daily_usage": 0
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/v1/auth/login", response_model=Token)
async def login(user: UserLogin):
    """로그인"""
    try:
        authenticated_user = authenticate_user(user.email, user.password)
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
        data={"sub": str(authenticated_user["id"])},  # 문자열로 변환
        expires_delta=access_token_expires
        )
        
        daily_usage = get_daily_usage(authenticated_user["id"])
        
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "plan": authenticated_user["plan"],
            "daily_usage": daily_usage
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.get("/api/v1/auth/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    """현재 사용자 정보"""
    daily_usage = get_daily_usage(current_user["id"])
    
    return User(
        id=current_user["id"],
        email=current_user["email"],
        plan=current_user["plan"],
        daily_usage=daily_usage,
        created_at=datetime.now()
    )

# 🎯 가상 피팅 엔드포인트
@app.post("/api/v1/virtual-tryon", response_model=VirtualTryonResponse)
async def virtual_tryon(
    request: VirtualTryonRequest,
    current_user: dict = Depends(get_current_user)
):
    """AI 가상 피팅 처리"""
    
    try:
        # 1. 사용량 제한 확인
        check_system_cost_limit()
        check_usage_limit(current_user["id"], current_user["plan"])
        
        print(f"🎯 FASHN API 가상 피팅 시작...")
        start_time = datetime.now()
        
        # 2. FASHN API 헤더 설정
        headers = {
            "Authorization": f"Bearer {FASHN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # 3. 올바른 FASHN API 요청 구조
        payload = {
            "model_image": request.person_image,  # base64 지원됨
            "garment_image": request.garment_image,  # base64 지원됨
            "category": "auto",  # 자동 분류
            "mode": "balanced",  # performance | balanced | quality
            "seed": 42,
            "num_samples": 1
        }
        
        print(f"🔍 FASHN API 요청 시작...")
        
        # 4. 첫 번째 요청: 예측 시작
        response = requests.post(
            "https://api.fashn.ai/v1/run",
            headers=headers,
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            error_msg = f"FASHN API 시작 실패: {response.status_code} - {response.text}"
            print(f"❌ {error_msg}")
            return VirtualTryonResponse(success=False, error=error_msg)
        
        # 5. 예측 ID 받기
        result = response.json()
        prediction_id = result.get("id")
        
        if not prediction_id:
            error_msg = "FASHN API에서 prediction ID를 받지 못했습니다"
            print(f"❌ {error_msg}")
            return VirtualTryonResponse(success=False, error=error_msg)
        
        print(f"🔍 Prediction ID: {prediction_id}")
        
        # 6. 상태 확인 루프 (최대 60초)
        max_wait_time = 60
        poll_interval = 3
        elapsed_time = 0
        
        while elapsed_time < max_wait_time:
            # 상태 확인 요청
            status_response = requests.get(
                f"https://api.fashn.ai/v1/status/{prediction_id}",
                headers=headers,
                timeout=10
            )
            
            if status_response.status_code == 200:
                status_result = status_response.json()
                status = status_result.get("status")
                
                print(f"🔍 Status: {status}")
                
                if status == "completed":
                    # 7. 성공 처리
                    output = status_result.get("output", [])
                    if output and len(output) > 0:
                        processing_time = (datetime.now() - start_time).total_seconds()
                        
                        # 사용량 기록
                        cost = 0.075
                        increment_usage(current_user["id"], cost)
                        
                        # 남은 사용량 계산
                        new_usage = get_daily_usage(current_user["id"])
                        plan_limit = PRICING_PLANS[current_user["plan"]]["daily_limit"]
                        remaining = plan_limit - new_usage if plan_limit != -1 else -1
                        
                        print(f"✅ FASHN API 성공: {processing_time}초")
                        
                        return VirtualTryonResponse(
                            success=True,
                            result_image=output[0],  # 첫 번째 결과 이미지 URL
                            processing_time=processing_time,
                            cost=cost,
                            remaining_usage=remaining
                        )
                    else:
                        return VirtualTryonResponse(success=False, error="결과 이미지를 받지 못했습니다")
                
                elif status == "failed":
                    error = status_result.get("error", "알 수 없는 오류")
                    return VirtualTryonResponse(success=False, error=f"FASHN API 처리 실패: {error}")
                
                elif status in ["starting", "in_queue", "processing"]:
                    # 계속 대기
                    await asyncio.sleep(poll_interval)
                    elapsed_time += poll_interval
                    continue
                
            else:
                print(f"⚠️ 상태 확인 실패: {status_response.status_code}")
                await asyncio.sleep(poll_interval)
                elapsed_time += poll_interval
        
        # 8. 타임아웃 처리
        return VirtualTryonResponse(success=False, error="처리 시간 초과 (60초)")
        
    except Exception as e:
        processing_time = (datetime.now() - start_time).total_seconds()
        error_msg = f"처리 오류: {str(e)} ({processing_time:.1f}초)"
        print(f"❌ {error_msg}")
        return VirtualTryonResponse(success=False, error=error_msg)

# 📊 요금제 정보 엔드포인트
@app.get("/api/v1/pricing")
async def get_pricing():
    """요금제 정보 조회"""
    return {
        "plans": PRICING_PLANS,
        "features_comparison": {
            "free": "체험용 - 기본 품질, 일일 3회",
            "pro": "개인용 - 고품질, 일일 50회",
            "business": "비즈니스용 - 최고품질, 무제한"
        }
    }

# 📈 사용량 통계 엔드포인트
@app.get("/api/v1/usage/stats")
async def get_usage_stats(current_user: dict = Depends(get_current_user)):
    """사용자 사용량 통계"""
    daily_usage = get_daily_usage(current_user["id"])
    plan = current_user["plan"]
    plan_limit = PRICING_PLANS[plan]["daily_limit"]
    
    return {
        "plan": plan,
        "daily_usage": daily_usage,
        "daily_limit": plan_limit,
        "remaining": plan_limit - daily_usage if plan_limit != -1 else -1,
        "unlimited": plan_limit == -1
    }

# 🚀 헬스체크 엔드포인트
@app.get("/")
async def root():
    return {
        "message": "iBurBa API v1.0.0",
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "features": [
            "AI 가상 피팅",
            "사용자 인증",
            "요금제 관리",
            "사용량 제한"
        ]
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)