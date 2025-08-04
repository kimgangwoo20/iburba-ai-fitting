# backend/auth.py - 사용자 인증 시스템
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
import sqlite3
import secrets

# 설정
SECRET_KEY = "iburba-secret-key-for-jwt-token-2025-very-secure-key-do-not-share"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# 모델 정의
class UserCreate(BaseModel):
    email: str
    password: str
    plan: str = "free"

class UserLogin(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    plan: str
    daily_usage: int

class User(BaseModel):
    id: int
    email: str
    plan: str
    daily_usage: int
    created_at: datetime

# 요금제 정의
PRICING_PLANS = {
    "free": {
        "name": "무료 체험",
        "price": 0,
        "daily_limit": 3,
        "features": ["일일 3회 무료", "표준 품질 (512px)", "기본 지원"]
    },
    "pro": {
        "name": "프로",
        "price": 9.99,
        "daily_limit": 50,
        "features": ["일일 50회", "고품질 (768px)", "우선 지원"]
    },
    "business": {
        "name": "비즈니스",
        "price": 49.99,
        "daily_limit": -1,
        "features": ["무제한 사용", "최고품질 (1024px)", "API 접근", "전담 지원"]
    }
}

# 데이터베이스 초기화
def init_db():
    conn = sqlite3.connect('iburba.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            plan TEXT DEFAULT 'free',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            date TEXT,
            count INTEGER DEFAULT 0,
            cost REAL DEFAULT 0.0,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, date)
        )
    ''')
    
    conn.commit()
    conn.close()

# 비밀번호 해싱
def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

# JWT 토큰 생성
def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# 사용자 생성
def create_user(email: str, password: str, plan: str = "free") -> dict:
    conn = sqlite3.connect('iburba.db')
    cursor = conn.cursor()
    
    try:
        hashed_password = hash_password(password)
        cursor.execute(
            "INSERT INTO users (email, password_hash, plan) VALUES (?, ?, ?)",
            (email, hashed_password, plan)
        )
        user_id = cursor.lastrowid
        conn.commit()
        
        return {"id": user_id, "email": email, "plan": plan}
    
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="이미 등록된 이메일입니다")
    finally:
        conn.close()

# 사용자 인증
def authenticate_user(email: str, password: str) -> dict:
    conn = sqlite3.connect('iburba.db')
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT id, email, password_hash, plan FROM users WHERE email = ?",
        (email,)
    )
    user = cursor.fetchone()
    conn.close()
    
    if not user or not verify_password(password, user[2]):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 잘못되었습니다")
    
    return {"id": user[0], "email": user[1], "plan": user[3]}

# 현재 사용자 가져오기
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        print(f"🔍 디버그: 받은 토큰 앞부분 = {credentials.credentials[:50]}...")
        print(f"🔍 디버그: SECRET_KEY 앞부분 = {SECRET_KEY[:20]}...")
        print(f"🔍 디버그: 알고리즘 = {ALGORITHM}")
        
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = int(payload.get("sub"))
        
        print(f"🔍 디버그: JWT 디코딩 성공! user_id = {user_id}")
        print(f"🔍 디버그: payload = {payload}")
        
        if user_id is None:
            print("❌ 디버그: user_id가 None입니다")
            raise HTTPException(status_code=401, detail="토큰이 유효하지 않습니다")
            
    except JWTError as e:
        print(f"❌ JWT 디코딩 에러 상세: {type(e).__name__}: {e}")
        raise HTTPException(status_code=401, detail="토큰이 유효하지 않습니다")
    except Exception as e:
        print(f"❌ 예상치 못한 에러: {type(e).__name__}: {e}")
        raise HTTPException(status_code=401, detail="토큰이 유효하지 않습니다")
    
    conn = sqlite3.connect('iburba.db')
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, plan FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    
    if user is None:
        print(f"❌ 디버그: 데이터베이스에서 user_id {user_id}를 찾을 수 없습니다")
        raise HTTPException(status_code=401, detail="사용자를 찾을 수 없습니다")
    
    print(f"✅ 디버그: 인증 성공! user = {user}")
    return {"id": user[0], "email": user[1], "plan": user[2]}

# 일일 사용량 확인
def get_daily_usage(user_id: int) -> int:
    today = datetime.now().strftime('%Y-%m-%d')
    
    conn = sqlite3.connect('iburba.db')
    cursor = conn.cursor()
    cursor.execute(
        "SELECT count FROM usage_logs WHERE user_id = ? AND date = ?",
        (user_id, today)
    )
    result = cursor.fetchone()
    conn.close()
    
    return result[0] if result else 0

# 사용량 증가
def increment_usage(user_id: int, cost: float = 0.075):
    today = datetime.now().strftime('%Y-%m-%d')
    
    conn = sqlite3.connect('iburba.db')
    cursor = conn.cursor()
    
    cursor.execute(
        "SELECT count, cost FROM usage_logs WHERE user_id = ? AND date = ?",
        (user_id, today)
    )
    result = cursor.fetchone()
    
    if result:
        new_count = result[0] + 1
        new_cost = result[1] + cost
        cursor.execute(
            "UPDATE usage_logs SET count = ?, cost = ? WHERE user_id = ? AND date = ?",
            (new_count, new_cost, user_id, today)
        )
    else:
        cursor.execute(
            "INSERT INTO usage_logs (user_id, date, count, cost) VALUES (?, ?, ?, ?)",
            (user_id, today, 1, cost)
        )
    
    conn.commit()
    conn.close()

# 사용량 제한 확인
def check_usage_limit(user_id: int, plan: str) -> bool:
    daily_usage = get_daily_usage(user_id)
    plan_limit = PRICING_PLANS[plan]["daily_limit"]
    
    if plan_limit == -1:
        return True
    
    if daily_usage >= plan_limit:
        raise HTTPException(
            status_code=403,
            detail=f"일일 사용량 한도 초과 ({daily_usage}/{plan_limit}). 플랜을 업그레이드하세요."
        )
    
    return True

# 전체 시스템 비용 제한
def check_system_cost_limit():
    today = datetime.now().strftime('%Y-%m-%d')
    MAX_DAILY_COST = 50.0
    
    conn = sqlite3.connect('iburba.db')
    cursor = conn.cursor()
    cursor.execute("SELECT SUM(cost) FROM usage_logs WHERE date = ?", (today,))
    result = cursor.fetchone()
    conn.close()
    
    total_cost = result[0] if result[0] else 0.0
    
    if total_cost >= MAX_DAILY_COST:
        raise HTTPException(
            status_code=503,
            detail="시스템 일일 비용 한도 초과. 잠시 후 다시 시도하세요."
        )
    
    return True

# 데이터베이스 초기화
init_db()