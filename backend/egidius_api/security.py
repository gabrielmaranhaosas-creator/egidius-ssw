import secrets, hashlib, hmac
from datetime import timedelta
from .db import utcnow

ITERATIONS = 600_000
SESSION_HOURS = 12

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf8'), salt, ITERATIONS)
    return f'pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest.hex()}'

def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt, expected = stored.split('$')
        if algo != 'pbkdf2_sha256' or not (400_000 <= int(rounds) <= 2_000_000): return False
        computed = hashlib.pbkdf2_hmac('sha256', password.encode('utf8'), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(computed, bytes.fromhex(expected))
    except (ValueError, TypeError): return False

def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode('utf8')).hexdigest()

def expires_at():
    return utcnow() + timedelta(hours=SESSION_HOURS)
