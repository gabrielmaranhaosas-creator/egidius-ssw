"""Privilégios explícitos; convites coletivos nunca concedem administração."""
from fastapi import HTTPException
from .db import UserRole

ROLES = ('viewer', 'operator', 'admin')
def role_for(db, username):
    grant = db.get(UserRole, username)
    if grant:
        return grant.role if grant.role in ROLES else 'viewer'
    if username in ('admin', 'operador_local'):
        return 'admin'
    if username == 'confrade_ssw':
        return 'operator'
    return 'viewer'

def require_admin(db, username):
    if role_for(db, username) != 'admin':
        raise HTTPException(403, 'Esta ação exige acesso de administração. Entre com sua conta de organização.')
