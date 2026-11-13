from __future__ import annotations
import os, json, secrets, hmac
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.orm import Session as DbSession
from .db import session_factory, User, Session, State, History, AthleteProfile, UserRole, OperationAudit, InviteAccess, utcnow
from .security import token_hash, expires_at, verify_password, hash_password
from .schema import Atualizacao, DadosSSW
from .profiles import AtualizacaoPerfil, PerfilEntrada, perfil_serializado
from .media import media_router, newest_portraits
from .importer import importer_router
from .bulk_media import bulk_media_router
from .viagem_ssw import viagem_router
from .intake import intake_router
from .exports import exports_router

COOKIE_NAME = 'egidius_session'
MAX_BODY = 5 * 1024 * 1024

def create_app(database_url: str | None = None) -> FastAPI:
    db_factory, engine = session_factory(database_url)
    app = FastAPI(title='EGIDIUS API', version='0.9.0', docs_url=None, redoc_url=None, openapi_url=None)
    app.state.engine = engine
    app.state.db_factory = db_factory

    def get_db():
        with db_factory() as db:
            yield db

    def session_auth(request: Request, db: DbSession = Depends(get_db)) -> Session:
        token = request.cookies.get(COOKIE_NAME)
        if not token or len(token) > 150:
            raise HTTPException(401, 'Faça login para acessar o EGIDIUS.')
        session = db.get(Session, token_hash(token))
        if not session or session.expires_at.replace(tzinfo=timezone.utc) < utcnow():
            raise HTTPException(401, 'Sessão expirada. Entre novamente.')
        return session

    def check_csrf(request: Request, sess: Session = Depends(session_auth)) -> Session:
        if not hmac.compare_digest(request.headers.get('x-csrf-token', ''), sess.csrf_token):
            raise HTTPException(403, 'Token de proteção inválido. Recarregue a página.')
        origin = request.headers.get('origin')
        if origin:
            allowed = [v.strip() for v in os.getenv('EGIDIUS_ALLOWED_ORIGINS','http://127.0.0.1:5173,http://localhost:5173').split(',') if v.strip()]
            # A mesma origem do servidor também é aceita para produção atrás de proxy TLS.
            server_origin = f'{request.url.scheme}://{request.headers.get("host", "")}'
            # Em hospedagens com TLS terminado no proxy, o ASGI pode receber
            # request.url.scheme=http. Validamos também a origem pelo Host real.
            from urllib.parse import urlsplit
            parsed_origin = urlsplit(origin)
            same_host = parsed_origin.netloc == request.headers.get('host', '')
            secure_required = os.getenv('EGIDIUS_SECURE_COOKIES','false').lower() == 'true'
            same_origin_at_proxy = (same_host and parsed_origin.scheme == ('https' if secure_required else request.url.scheme))
            if origin not in allowed and origin != server_origin and not same_origin_at_proxy:
                raise HTTPException(403, 'Origem não autorizada.')
        return sess

    async def json_bounded(request: Request):
        size = 0
        chunks = []
        async for chunk in request.stream():
            size += len(chunk)
            if size > MAX_BODY: raise HTTPException(413, 'Arquivo ou documento muito grande.')
            chunks.append(chunk)
        try: return json.loads(b''.join(chunks))
        except (UnicodeDecodeError, ValueError): raise HTTPException(400, 'JSON inválido.')

    app.include_router(media_router(session_auth, check_csrf, get_db))
    app.include_router(importer_router(session_auth, check_csrf, get_db))
    app.include_router(bulk_media_router(session_auth, check_csrf, get_db))
    app.include_router(viagem_router(session_auth, check_csrf, get_db))
    app.include_router(intake_router(session_auth, check_csrf, get_db))
    app.include_router(exports_router(session_auth, get_db))

    from .permissions import role_for, require_admin, ROLES

    @app.middleware('http')
    async def permissions(request, call_next):
        path = request.url.path
        protected = path.startswith('/api/') and not path.startswith('/api/auth/') and path != '/api/health'
        actor = None
        if protected:
            try:
                with db_factory() as db:
                    sess = session_auth(request, db)
                    actor = sess.username
                    role = role_for(db, actor)
                    if request.method not in ('GET','HEAD','OPTIONS') and role == 'viewer':
                        raise HTTPException(403, 'Seu acesso é de consulta. Peça a um organizador para registrar alterações.')
                    if path.startswith('/api/admin') or path.startswith('/api/backup') or '/purge' in path:
                        require_admin(db, actor)
            except HTTPException as exc:
                return JSONResponse({'detail': exc.detail},status_code=exc.status_code)
        response = await call_next(request)
        if actor and request.method in ('POST','PUT','PATCH','DELETE') and 200 <= response.status_code < 300:
            try:
                with db_factory.begin() as db:
                    db.add(OperationAudit(actor=actor,action=f'{request.method} {path}'[:250]))
            except Exception:
                import logging
                logging.getLogger('egidius').error('Falha ao registrar auditoria de operação concluída.')
        return response

    @app.get('/api/admin/access')
    def access_list(sess=Depends(session_auth), db:DbSession=Depends(get_db)):
        require_admin(db,sess.username)
        return {'users':[{'username':u.username,'role':role_for(db,u.username)} for u in db.scalars(select(User)).all()],
                'audit':[{'actor':a.actor,'action':a.action,'created_at':a.created_at.isoformat()} for a in db.scalars(select(OperationAudit).order_by(OperationAudit.id.desc()).limit(100)).all()]}

    @app.put('/api/admin/access/{username}')
    async def access_update(username:str,request:Request,sess=Depends(check_csrf),db:DbSession=Depends(get_db)):
        list(db.scalars(select(User).order_by(User.username).with_for_update()).all())
        require_admin(db,sess.username)
        value=await json_bounded(request)
        if not isinstance(value,dict) or set(value)!={'role'} or value['role'] not in ROLES:
            raise HTTPException(422,'Escolha consulta, operação ou administração.')
        if not db.get(User,username):raise HTTPException(404,'Conta não encontrada.')
        if username=='confrade_ssw' and value['role']=='admin':raise HTTPException(409,'O convite coletivo não pode receber administração. Use uma conta individual.')
        if username==sess.username or username=='operador_local':raise HTTPException(409,'Não altere seu próprio acesso ou o acesso local de recuperação.')
        row=db.get(UserRole,username)
        if row:row.role=value['role']
        else:db.add(UserRole(username=username,role=value['role']))
        db.commit()
        return {'username':username,'role':value['role']}

    @app.post('/api/admin/invites')
    async def invite_create(request:Request,sess=Depends(check_csrf),db:DbSession=Depends(get_db)):
        require_admin(db,sess.username)
        value=await json_bounded(request)
        import re
        if not isinstance(value,dict) or not isinstance(value.get('username'),str) or not re.fullmatch(r'[a-zA-Z0-9_][a-zA-Z0-9_.-]{2,49}',value['username']) or value.get('role') not in ('viewer','operator'):
            raise HTTPException(422,'Use identificação de 3 a 50 letras sem acentos, números, ponto, hífen ou sublinhado; escolha consulta ou operação.')
        username=value['username']
        if db.get(User,username):raise HTTPException(409,'Identificação já usada. Crie outra; os acessos existentes não foram alterados.')
        raw=secrets.token_urlsafe(40)
        db.add(User(username=username,password_hash=hash_password(secrets.token_urlsafe(36))));db.flush()
        db.add(UserRole(username=username,role=value['role']))
        db.add(InviteAccess(token_hash=token_hash(raw),username=username,expires_at=utcnow()+timedelta(days=7)))
        db.commit()
        return JSONResponse({'token':raw,'username':username,'expires_in_days':7},headers={'Cache-Control':'no-store'})

    @app.post('/api/admin/invites/{username}/revoke')
    def revoke_invite(username:str,sess=Depends(check_csrf),db:DbSession=Depends(get_db)):
        require_admin(db,sess.username)
        entries=db.scalars(select(InviteAccess).where(InviteAccess.username==username)).all()
        if not entries:raise HTTPException(404,'Nenhum convite individual encontrado para esta conta.')
        for entry in entries:entry.revoked=1
        from sqlalchemy import delete
        db.execute(delete(Session).where(Session.username==username));db.commit()
        return {'ok':True}

    def serialize_profile(row, db: DbSession):
        return {**perfil_serializado(row), **newest_portraits(db, row.athlete_id)}

    @app.get('/api/health')
    def health(): return {'status': 'ok', 'service': 'egidius', 'version': '0.9.0'}

    @app.get('/api/auth/status')
    def status(request: Request, db: DbSession = Depends(get_db)):
        users = db.query(User).count()
        try:
            session = session_auth(request, db)
            return {'authenticated': True, 'role': role_for(db,session.username), 'username': session.username, 'csrf': session.csrf_token, 'setup_required': False}
        except HTTPException:
            return {'authenticated': False, 'setup_required': users == 0}

    @app.post('/api/auth/invite')
    async def invite_entry(request: Request, response: Response, db: DbSession = Depends(get_db)):
        """Entrada sem senha por convite compartilhado; exigida configuração explícita."""
        expected = os.getenv('EGIDIUS_PUBLIC_INVITE_TOKEN', '')
        # Convites individuais também funcionam sem convite coletivo configurado.
        # Não aceite aplicações de terceiros enviando pedidos cross-site.
        origin = request.headers.get('origin')
        host = request.headers.get('host', '')
        if origin:
            from urllib.parse import urlsplit
            parsed = urlsplit(origin)
            if parsed.netloc != host or parsed.scheme not in ('https','http'):
                raise HTTPException(403, 'Origem inválida.')
            if os.getenv('EGIDIUS_SECURE_COOKIES','false').lower() == 'true' and parsed.scheme != 'https':
                raise HTTPException(403, 'Acesso HTTPS obrigatório.')
        data = await json_bounded(request)
        token = data.get('token') if isinstance(data,dict) else None
        if not isinstance(token,str) or len(token)>300 or len(token)<40:raise HTTPException(403,'Convite inválido.')
        individual=db.get(InviteAccess,token_hash(token))
        if individual and not individual.revoked and individual.expires_at.replace(tzinfo=timezone.utc)>utcnow():
            username=individual.username
        elif len(expected)>=40 and hmac.compare_digest(token,expected):
            username='confrade_ssw'
        else:raise HTTPException(403,'Convite inválido, expirado ou revogado. Solicite outro ao organizador.')
        user = db.get(User,username)
        if user is None:
            # Senha aleatória inacessível; a conta só recebe acesso pelo convite.
            user = User(username=username,password_hash=hash_password(secrets.token_urlsafe(36)))
            db.add(user)
        raw = secrets.token_urlsafe(36)
        csrf = secrets.token_urlsafe(36)
        duration = 7 * 24 * 3600
        db.add(Session(token_hash=token_hash(raw), username=username, csrf_token=csrf,
                       expires_at=utcnow() + timedelta(seconds=duration)))
        db.commit()
        secure = os.getenv('EGIDIUS_SECURE_COOKIES','false').lower() == 'true'
        response.set_cookie(COOKIE_NAME,raw,max_age=duration,httponly=True,secure=secure,samesite='lax',path='/api')
        response.headers['Cache-Control']='no-store'
        return {'authenticated':True,'role':role_for(db,username),'username':username,'csrf':csrf}

    @app.post('/api/auth/local')
    def local_entry(request: Request, response: Response, db: DbSession = Depends(get_db)):
        """Entrada direta exclusiva do inicializador local; convites externos permanecem separados."""
        from urllib.parse import urlsplit
        import ipaddress
        if os.getenv('EGIDIUS_LOCAL_ACCESS', '').lower() != 'true':
            raise HTTPException(404, 'Acesso local indisponível.')
        if os.getenv('EGIDIUS_SECURE_COOKIES', 'false').lower() == 'true':
            raise HTTPException(403, 'Utilize o convite de acesso.')
        try:
            peer_local = ipaddress.ip_address(request.client.host).is_loopback
        except (ValueError, AttributeError):
            peer_local = False
        allowed_hosts = {'127.0.0.1:8017', 'localhost:8017', '127.0.0.1:5173', 'localhost:5173'}
        host = request.headers.get('host', '').lower()
        if not peer_local or host not in allowed_hosts or request.url.scheme != 'http':
            raise HTTPException(403, 'Utilize o convite de acesso.')
        origin = request.headers.get('origin')
        if origin:
            parsed = urlsplit(origin)
            if parsed.scheme != 'http' or parsed.netloc.lower() not in allowed_hosts or parsed.path or parsed.query or parsed.fragment:
                raise HTTPException(403, 'Origem não autorizada.')
        if request.headers.get('sec-fetch-site') == 'cross-site':
            raise HTTPException(403, 'Origem não autorizada.')
        try:
            sess = session_auth(request, db)
        except HTTPException:
            username = 'operador_local'
            if db.get(User, username) is None:
                db.add(User(username=username, password_hash=hash_password(secrets.token_urlsafe(36))))
                from sqlalchemy.exc import IntegrityError
                try:
                    db.commit()
                except IntegrityError:
                    db.rollback()
                    if db.get(User, username) is None:
                        raise
            raw = secrets.token_urlsafe(36)
            sess = Session(token_hash=token_hash(raw), username=username,
                           csrf_token=secrets.token_urlsafe(36), expires_at=expires_at())
            db.add(sess)
            db.commit()
            response.set_cookie(COOKIE_NAME, raw, max_age=12*3600, httponly=True,
                                secure=False, samesite='strict', path='/api')
        response.headers['Cache-Control'] = 'no-store'
        return {'authenticated': True, 'role':role_for(db,sess.username), 'username': sess.username, 'csrf': sess.csrf_token}

    @app.post('/api/auth/login')
    async def login(request: Request, response: Response, db: DbSession = Depends(get_db)):
        data = await json_bounded(request)
        if not isinstance(data, dict): raise HTTPException(400, 'Dados inválidos')
        username = data.get('username','')
        password = data.get('password','')
        if not isinstance(username, str) or not isinstance(password, str) or len(username) > 100 or len(password) > 300:
            raise HTTPException(400, 'Dados inválidos')
        user = db.get(User, username)
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(401, 'Usuário ou senha incorretos.')
        raw_token = secrets.token_urlsafe(36)
        csrf = secrets.token_urlsafe(36)
        db.add(Session(token_hash=token_hash(raw_token), username=user.username, csrf_token=csrf, expires_at=expires_at()))
        db.commit()
        secure = os.getenv('EGIDIUS_SECURE_COOKIES', 'false').lower() == 'true'
        response.set_cookie(COOKIE_NAME, raw_token, max_age=12*3600, httponly=True, secure=secure, samesite='lax', path='/api')
        response.headers['Cache-Control'] = 'no-store'
        return {'authenticated': True, 'role':role_for(db,user.username), 'username': user.username, 'csrf': csrf}

    @app.post('/api/auth/logout')
    def logout(response: Response, sess: Session = Depends(check_csrf), db: DbSession = Depends(get_db)):
        db.delete(sess); db.commit()
        response.delete_cookie(COOKIE_NAME, path='/api')
        return {'ok': True}

    @app.get('/api/state')
    def get_state(sess: Session = Depends(session_auth), db: DbSession = Depends(get_db)):
        row = db.get(State, 1)
        return JSONResponse({'revision': row.revision, 'data': json.loads(row.payload)}, headers={'Cache-Control': 'no-store'})

    @app.put('/api/state')
    async def put_state(request: Request, sess: Session = Depends(check_csrf), db: DbSession = Depends(get_db)):
        content = await json_bounded(request)
        try: incoming = Atualizacao.model_validate(content)
        except ValidationError as exc: raise HTTPException(422, 'Estrutura de dados inválida. Corrija o cadastro e tente novamente.') from exc
        current=db.get(State,1)
        if current.revision != incoming.expected_revision:raise HTTPException(409,'Outra sessão já alterou os dados. O envio foi bloqueado.')
        old=json.loads(current.payload);new=incoming.data.model_dump()
        if role_for(db,sess.username)!='admin':
            if any({x['id'] for x in old.get(key,[])}-{x['id'] for x in new.get(key,[])} for key in ('jogadores','rodadas')):
                raise HTTPException(403,'Excluir jogadores ou sábados exige administração. Os registros foram preservados.')
        by_id={g['id']:g for r in new['rodadas'] for g in r['jogos']}
        for r in old['rodadas']:
            for game in r['jogos']:
                if game['status']=='encerrada':
                    candidate=by_id.get(game['id'])
                    if not candidate:raise HTTPException(422,'Reabra a partida antes de removê-la. O histórico foi preservado.')
                    if candidate['status']=='rascunho':
                        reopened={**candidate,'status':'encerrada'}
                        if reopened!=game:raise HTTPException(422,'Reabra a partida primeiro, mantendo os registros; depois aplique a correção.')
                    elif candidate!=game:raise HTTPException(422,'Partida encerrada: reabra antes de corrigir.')
        normalized = incoming.data.model_dump_json()
        # Atomic compare-and-swap evita que uma aba sobrescreva a gravação de outra.
        result = db.execute(update(State).where(State.id == 1, State.revision == incoming.expected_revision)
          .values(revision=incoming.expected_revision + 1, payload=normalized, updated_at=utcnow()))
        if result.rowcount != 1:
            db.rollback()
            raise HTTPException(409, 'Outra sessão já alterou os dados. O envio foi bloqueado.')
        db.add(History(revision=incoming.expected_revision+1, actor=sess.username, payload=normalized))
        db.commit()
        return {'revision': incoming.expected_revision+1}

    @app.get('/api/athletes/profiles')
    def listar_perfis(sess: Session = Depends(session_auth), db: DbSession = Depends(get_db)):
        """Somente perfis dos IDs do elenco atual; legado permanece intocado."""
        roster = json.loads(db.get(State, 1).payload)
        athlete_ids = {j['id'] for j in roster['jogadores']}
        perfis = [serialize_profile(row, db) for row in db.scalars(select(AthleteProfile)).all()
                   if row.athlete_id in athlete_ids]
        # Imagens enviadas antes de salvar a ficha também devem aparecer na grade.
        stored_ids = {p['athlete_id'] for p in perfis}
        for aid in athlete_ids - stored_ids:
            portraits = newest_portraits(db, aid)
            if portraits['fotoMediaId'] or portraits['caricaturaMediaId']:
                perfis.append({'athlete_id':aid, 'revision':0, 'updated_at':None,
                               'profile':PerfilEntrada().model_dump(), **portraits})
        return JSONResponse({'profiles':perfis}, headers={'Cache-Control':'no-store'})

    @app.put('/api/athletes/profiles/{athlete_id}')
    async def gravar_perfil(athlete_id: str, request: Request,
                            sess: Session = Depends(check_csrf), db: DbSession = Depends(get_db)):
        if not athlete_id or len(athlete_id)>140: raise HTTPException(400, 'Identificador inválido')
        raw = await json_bounded(request)
        try: incoming = AtualizacaoPerfil.model_validate(raw)
        except ValidationError as exc: raise HTTPException(422, 'Campos do perfil inválidos.') from exc
        elenco = json.loads(db.get(State, 1).payload)
        if athlete_id not in {j['id'] for j in elenco['jogadores']}:
            raise HTTPException(404, 'Atleta não encontrado na base do EGIDIUS.')
        perfil = incoming.profile
        if perfil.numeroFigurinha is not None:
            for existente in db.scalars(select(AthleteProfile)).all():
                if existente.athlete_id != athlete_id and json.loads(existente.payload).get('numeroFigurinha') == perfil.numeroFigurinha:
                    raise HTTPException(409, 'Número da figurinha já utilizado por outro atleta.')
        payload = perfil.model_dump_json()
        if incoming.expected_revision == 0:
            if db.get(AthleteProfile, athlete_id) is not None:
                raise HTTPException(409, 'Perfil atualizado por outra sessão. Recarregue os dados.')
            # Um INSERT protegido pela chave primária impede criação simultânea duplicada.
            from sqlalchemy.exc import IntegrityError
            db.add(AthleteProfile(athlete_id=athlete_id, revision=1, payload=payload, sticker_number=perfil.numeroFigurinha, updated_at=utcnow()))
            try: db.commit()
            except IntegrityError:
                db.rollback()
                raise HTTPException(409, 'Perfil atualizado por outra sessão. Recarregue os dados.')
        else:
            result = db.execute(update(AthleteProfile)
              .where(AthleteProfile.athlete_id==athlete_id,
                     AthleteProfile.revision==incoming.expected_revision)
              .values(revision=incoming.expected_revision+1,payload=payload,sticker_number=perfil.numeroFigurinha,updated_at=utcnow()))
            if result.rowcount != 1:
                db.rollback()
                raise HTTPException(409, 'Perfil alterado em outra sessão. Atualize antes de salvar.')
            from sqlalchemy.exc import IntegrityError
            try: db.commit()
            except IntegrityError:
                db.rollback()
                raise HTTPException(409, 'Número da figurinha em uso por outro atleta.')
        row=db.get(AthleteProfile,athlete_id)
        return JSONResponse(serialize_profile(row, db),headers={'Cache-Control':'no-store'})

    return app

app = create_app()
