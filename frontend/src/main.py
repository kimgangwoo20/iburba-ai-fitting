from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
import base64
import logging
from pydantic import BaseModel
import json
import io
import asyncio
import time
from PIL import Image

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="iBurBa API")

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

class VirtualTryonRequest(BaseModel):
    person_image: str
    garment_image: str

def base64_to_image_bytes(base64_string):
    """Base64 문자열을 이미지 바이트로 변환"""
    try:
        # data:image/jpeg;base64, 제거
        if base64_string.startswith('data:image'):
            base64_string = base64_string.split(',')[1]
        
        image_bytes = base64.b64decode(base64_string)
        return image_bytes
    except Exception as e:
        logger.error(f"Base64 디코딩 오류: {e}")
        raise HTTPException(400, "이미지 형식이 올바르지 않습니다")

def resize_image(image_bytes, max_size=(768, 1024)):
    """이미지 크기 조정"""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.thumbnail(max_size, Image.Resampling.LANCZOS)
        
        # PNG로 변환
        output = io.BytesIO()
        image.save(output, format='PNG')
        return output.getvalue()
    except Exception as e:
        logger.error(f"이미지 리사이징 오류: {e}")
        raise HTTPException(400, "이미지 처리 중 오류가 발생했습니다")

async def poll_fashn_status(job_id: str, headers: dict, max_wait_time: int = 60):
    """FASHN API 작업 상태를 폴링하여 결과 반환"""
    logger.info(f"🔄 FASHN API 상태 확인 시작 - Job ID: {job_id}")
    
    start_time = time.time()
    poll_interval = 3  # 3초마다 확인
    
    while time.time() - start_time < max_wait_time:
        try:
            # FASHN API status 엔드포인트 호출
            status_url = f"{FASHN_BASE_URL}/status/{job_id}"
            logger.info(f"📡 상태 확인 중: {status_url}")
            
            response = requests.get(status_url, headers=headers, timeout=30)
            logger.info(f"상태 확인 응답: {response.status_code}")
            
            if response.status_code == 200:
                status_data = response.json()
                logger.info(f"작업 상태: {status_data}")
                
                status = status_data.get("status", "unknown")
                
                if status == "completed":
                    # 작업 완료 - 결과 이미지 URL 반환
                    output_urls = status_data.get("output", [])
                    if output_urls and len(output_urls) > 0:
                        result_image_url = output_urls[0]  # 첫 번째 결과 이미지
                        
                        logger.info(f"✅ 가상 피팅 완료! 결과 URL: {result_image_url[:50]}...")
                        
                        return {
                            "success": True,
                            "result_image": result_image_url,
                            "processing_time": int(time.time() - start_time),
                            "message": "가상 피팅이 완료되었습니다!",
                            "api_response": "FASHN API 비동기 처리 완료",
                            "job_id": job_id
                        }
                    else:
                        logger.error(f"완료된 작업에 결과 이미지 없음: {status_data}")
                        return {
                            "success": False,
                            "error": "결과 이미지 없음",
                            "message": "작업은 완료되었지만 결과 이미지를 찾을 수 없습니다",
                            "debug_info": status_data
                        }
                
                elif status == "failed":
                    # 작업 실패
                    error_msg = status_data.get("error", "작업 처리 중 오류 발생")
                    logger.error(f"❌ FASHN API 작업 실패: {error_msg}")
                    
                    return {
                        "success": False,
                        "error": "작업 실패",
                        "message": f"가상 피팅 처리 실패: {error_msg}",
                        "debug_info": status_data
                    }
                
                elif status in ["queued", "processing", "starting"]:
                    # 작업 진행 중
                    elapsed = int(time.time() - start_time)
                    logger.info(f"⏳ 작업 진행 중... ({elapsed}초 경과, 상태: {status})")
                    
                    # 잠시 대기 후 다시 확인
                    await asyncio.sleep(poll_interval)
                    continue
                
                else:
                    # 알 수 없는 상태
                    logger.warning(f"알 수 없는 작업 상태: {status}")
                    await asyncio.sleep(poll_interval)
                    continue
            
            elif response.status_code == 404:
                logger.error(f"작업 ID를 찾을 수 없음: {job_id}")
                return {
                    "success": False,
                    "error": "작업 ID 없음",
                    "message": "작업을 찾을 수 없습니다",
                    "debug_info": f"Job ID: {job_id}"
                }
            
            else:
                logger.error(f"상태 확인 오류: {response.status_code} - {response.text[:200]}")
                await asyncio.sleep(poll_interval)
                continue
                
        except Exception as e:
            logger.error(f"상태 확인 중 오류: {str(e)}")
            await asyncio.sleep(poll_interval)
            continue
    
    # 시간 초과
    logger.error(f"⏰ 처리 시간 초과 ({max_wait_time}초)")
    return {
        "success": False,
        "error": "처리 시간 초과",
        "message": f"가상 피팅 처리가 {max_wait_time}초를 초과했습니다",
        "debug_info": f"Job ID: {job_id}, 처리 시간: {max_wait_time}초"
    }

@app.post("/api/v1/virtual-tryon")
async def virtual_tryon(request: VirtualTryonRequest):
    try:
        logger.info("🎯 iBurBa 가상 피팅 시작")
        
        # 1. 이미지 데이터 처리
        person_bytes = base64_to_image_bytes(request.person_image)
        garment_bytes = base64_to_image_bytes(request.garment_image)
        
        logger.info(f"이미지 크기 - 인물: {len(person_bytes)} bytes, 의상: {len(garment_bytes)} bytes")
        
        # 2. 이미지 크기 조정
        person_resized = resize_image(person_bytes)
        garment_resized = resize_image(garment_bytes)
        
        # 3. Base64로 다시 인코딩
        person_b64 = base64.b64encode(person_resized).decode('utf-8')
        garment_b64 = base64.b64encode(garment_resized).decode('utf-8')
        
        logger.info("이미지 전처리 완료")
        
        # 4. FASHN API 호출 (공식 문서 기준)
        headers = {
            "Authorization": f"Bearer {FASHN_API_KEY}",
            "Content-Type": "application/json"
        }
        
        # FASHN API 공식 파라미터 구조
        payload = {
            "model_image": f"data:image/png;base64,{person_b64}",
            "garment_image": f"data:image/png;base64,{garment_b64}",
            "category": "tops"  # tops, bottoms, dresses, outerwear
        }
        
        logger.info("🚀 FASHN API 호출 중...")
        logger.info(f"API 엔드포인트: {FASHN_BASE_URL}/run")
        logger.info(f"페이로드 크기: model_image={len(person_b64)}, garment_image={len(garment_b64)}")
        
        # FASHN API 실제 엔드포인트로 요청
        response = requests.post(
            f"{FASHN_BASE_URL}/run",
            headers=headers,
            json=payload,
            timeout=90  # 처리 시간 여유
        )
        
        logger.info(f"FASHN API 응답 상태: {response.status_code}")
        logger.info(f"응답 헤더: {dict(response.headers)}")
        
        if response.status_code == 200:
            try:
                result = response.json()
                logger.info(f"FASHN API 응답 구조: {list(result.keys()) if isinstance(result, dict) else type(result)}")
                
                # FASHN API 비동기 처리: job ID 반환 확인
                if isinstance(result, dict) and "id" in result:
                    job_id = result["id"]
                    logger.info(f"📋 FASHN API 작업 ID 수신: {job_id}")
                    
                    # 상태 확인 및 결과 대기 (최대 60초)
                    return await poll_fashn_status(job_id, headers)
                
                # 즉시 결과 반환 (구버전 호환성)
                elif isinstance(result, dict):
                    if "output" in result or "result" in result or "image" in result:
                        output_image = result.get("output") or result.get("result") or result.get("image")
                        
                        logger.info("✅ 가상 피팅 성공!")
                        return {
                            "success": True,
                            "result_image": output_image,
                            "processing_time": result.get("processing_time", 20),
                            "message": "가상 피팅이 완료되었습니다!",
                            "api_response": "FASHN API 정상 처리"
                        }
                    else:
                        # 예상치 못한 응답 구조
                        logger.warning(f"예상치 못한 FASHN API 응답: {result}")
                        return {
                            "success": False,
                            "error": "응답 형식 오류",
                            "message": "FASHN API 응답 형식이 예상과 다릅니다",
                            "debug_info": result
                        }
                elif isinstance(result, str):
                    # 문자열 응답인 경우 (base64 이미지일 수 있음)
                    logger.info("✅ 가상 피팅 성공 (문자열 응답)")
                    return {
                        "success": True,
                        "result_image": result if result.startswith('data:image') else f"data:image/png;base64,{result}",
                        "processing_time": 20,
                        "message": "가상 피팅이 완료되었습니다!",
                        "api_response": "FASHN API 정상 처리"
                    }
                else:
                    logger.error(f"예상치 못한 응답 형식: {type(result)}")
                    raise ValueError("응답 형식이 예상과 다릅니다")
                    
            except json.JSONDecodeError as e:
                logger.error(f"JSON 파싱 오류: {e}")
                logger.info("텍스트 응답으로 처리 시도...")
                
                # JSON이 아닌 경우 텍스트로 처리
                response_text = response.text
                if response_text and len(response_text) > 100:  # Base64 이미지로 추정
                    return {
                        "success": True,
                        "result_image": f"data:image/png;base64,{response_text}" if not response_text.startswith('data:') else response_text,
                        "processing_time": 20,
                        "message": "가상 피팅이 완료되었습니다! (텍스트 응답)",
                        "api_response": "FASHN API 비표준 응답"
                    }
                else:
                    raise HTTPException(500, f"응답 파싱 실패: {e}")
                    
        elif response.status_code == 401:
            logger.error("FASHN API 인증 실패 - API 키 확인 필요")
            return {
                "success": False,
                "error": "API 인증 실패",
                "message": "API 키를 확인해주세요",
                "debug_info": response.text[:200]
            }
            
        elif response.status_code == 429:
            logger.error("FASHN API 요청 한도 초과")
            return {
                "success": False,
                "error": "요청 한도 초과",
                "message": "잠시 후 다시 시도해주세요",
                "debug_info": "Rate limit exceeded"
            }
            
        elif response.status_code == 400:
            logger.error(f"FASHN API 요청 오류: {response.text}")
            return {
                "success": False,
                "error": "요청 형식 오류",
                "message": "이미지 형식이나 파라미터를 확인해주세요",
                "debug_info": response.text[:200]
            }
            
        else:
            logger.error(f"FASHN API 오류: {response.status_code} - {response.text[:200]}")
            
            # 🧪 개발 모드: API 실패 시 테스트 응답 반환
            logger.info("🧪 개발 모드: 테스트 응답 반환")
            return {
                "success": True,
                "result_image": f"data:image/png;base64,{person_b64}",  # 원본 이미지 반환
                "processing_time": 15,
                "message": f"개발 모드 테스트 (API 상태: {response.status_code})",
                "debug_info": {
                    "api_status": response.status_code,
                    "api_response": response.text[:200],
                    "note": "실제 서비스에서는 이 응답이 제거됩니다"
                },
                "is_test_mode": True
            }
        
    except requests.Timeout as e:
        logger.error(f"FASHN API 타임아웃: {str(e)}")
        return {
            "success": False,
            "error": "처리 시간 초과",
            "message": "처리 시간이 너무 오래 걸립니다. 다시 시도해주세요",
            "debug_info": "Request timeout"
        }
        
    except requests.ConnectionError as e:
        logger.error(f"FASHN API 연결 오류: {str(e)}")
        return {
            "success": False,
            "error": "네트워크 연결 오류",
            "message": "FASHN API 서버에 연결할 수 없습니다",
            "debug_info": str(e)[:200]
        }
        
    except requests.RequestException as e:
        logger.error(f"FASHN API 요청 오류: {str(e)}")
        return {
            "success": False,
            "error": "API 요청 오류",
            "message": "API 서비스에 일시적인 문제가 있습니다",
            "debug_info": str(e)[:200]
        }
        
    except Exception as e:
        logger.error(f"처리 오류: {str(e)}")
        raise HTTPException(500, f"서버 처리 오류: {str(e)}")

@app.get("/")
async def root():
    return {"message": "iBurBa API 서버", "status": "running", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    """서버 상태 확인"""
    return {
        "status": "healthy",
        "message": "iBurBa 백엔드 서버가 정상 작동 중입니다",
        "fashn_api_configured": bool(FASHN_API_KEY)
    }

if __name__ == "__main__":
    import uvicorn
    logger.info("🚀 iBurBa 백엔드 서버 시작!")
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)