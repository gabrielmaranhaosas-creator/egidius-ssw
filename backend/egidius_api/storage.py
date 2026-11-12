"""Armazenamento privado local ou S3, independente do disco da aplicação."""
from contextlib import contextmanager
from functools import lru_cache
import os
from pathlib import Path
import re
import shutil
from urllib.parse import urlsplit

from fastapi import HTTPException


def safe_name(name):
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,119}', name) or '..' in name:
        raise ValueError('Nome interno de arquivo inválido.')
    return name


class LocalStorage:
    remote = False

    def __init__(self, root):
        self.root = Path(root)

    def path(self, name):
        return self.root / safe_name(name)

    def put_file(self, name, source, mime):
        target = self.path(name)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            with target.open('xb') as out, Path(source).open('rb') as src:
                target.chmod(0o600)
                shutil.copyfileobj(src, out, 128 * 1024)
        except BaseException:
            # Só removemos um arquivo criado por esta operação.
            if 'out' in locals(): target.unlink(missing_ok=True)
            raise

    def remove(self, name):
        self.path(name).unlink(missing_ok=True)

    def exists(self, name):
        path = self.path(name)
        return path.exists() or path.is_symlink()

    def download(self, name, target, expected_size):
        source = self.path(name)
        if source.is_symlink() or not source.is_file() or source.stat().st_size != expected_size:
            raise HTTPException(409, 'Um arquivo do backup está indisponível. Tente novamente.')
        shutil.copyfile(source, target)
        if Path(target).stat().st_size != expected_size:
            raise HTTPException(409, 'O arquivo mudou durante o backup. Tente novamente.')

    def check(self):
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)


class S3Storage:
    remote = True

    def __init__(self, endpoint, bucket, access, secret, region, prefix):
        from boto3 import client
        from botocore.config import Config
        parsed = urlsplit(endpoint)
        local_test = os.getenv('EGIDIUS_STORAGE_TESTING') == 'true' and parsed.hostname in ('127.0.0.1', 'localhost')
        if ((parsed.scheme != 'https' and not local_test) or not parsed.hostname
                or parsed.username or parsed.password or parsed.query or parsed.fragment):
            raise ValueError('O armazenamento remoto exige endpoint HTTPS.')
        missing = [key for key, value in (
            ('EGIDIUS_S3_BUCKET', bucket),
            ('EGIDIUS_S3_ACCESS_KEY_ID', access),
            ('EGIDIUS_S3_SECRET_ACCESS_KEY', secret),
            ('EGIDIUS_S3_REGION', region),
        ) if not value]
        if missing:
            raise ValueError('Configuração do armazenamento ausente: ' + ', '.join(missing))
        if not re.fullmatch(r'[a-zA-Z0-9/_-]{0,160}', prefix) or '..' in prefix:
            raise ValueError('Prefixo de armazenamento inválido.')
        self.bucket = bucket
        self.prefix = prefix.rstrip('/') + '/' if prefix else ''
        self.client = client('s3', endpoint_url=endpoint, aws_access_key_id=access,
                             aws_secret_access_key=secret, region_name=region,
                             config=Config(signature_version='s3v4', s3={'addressing_style': 'path'},
                                           connect_timeout=10, read_timeout=60,
                                           retries={'max_attempts': 2, 'mode': 'standard'},
                                           request_checksum_calculation='when_required',
                                           response_checksum_validation='when_required'))

    def key(self, name):
        return self.prefix + safe_name(name)

    @contextmanager
    def errors(self):
        from botocore.exceptions import BotoCoreError, ClientError
        try:
            yield
        except ClientError as error:
            # Só códigos conhecidos: mensagens livres do provedor podem conter segredos.
            code = error.response.get('Error', {}).get('Code', '')
            allowed = {'AccessDenied', 'InvalidAccessKeyId', 'SignatureDoesNotMatch',
                       'NoSuchBucket', 'NoSuchKey', 'InvalidToken', 'ExpiredToken',
                       'RequestTimeTooSkewed', 'AuthorizationHeaderMalformed',
                       'InvalidRequest', 'NotImplemented', 'InternalError',
                       'ServiceUnavailable', 'SlowDown', '400', '401', '403',
                       '404', '409', '429', '500', '501', '502', '503', '504'}
            code = code if code in allowed else 'StorageError'
            operation = error.operation_name
            if operation not in {'HeadBucket', 'GetBucketAcl', 'HeadObject',
                                 'GetObject', 'PutObject', 'DeleteObject'}:
                operation = 'S3'
            raise HTTPException(503, f'Armazenamento indisponível ({operation}: {code}). Tente novamente.') from None
        except BotoCoreError as error:
            kind = type(error).__name__
            if kind not in {'EndpointConnectionError', 'ConnectTimeoutError',
                            'ReadTimeoutError', 'SSLError', 'ConnectionClosedError',
                            'ProxyConnectionError'}:
                kind = 'StorageConnectionError'
            raise HTTPException(503, f'Falha de comunicação com o armazenamento ({kind}). Tente novamente.') from None

    def check(self):
        with self.errors():
            # GET também comprova existência/acesso e conserva o código S3 de erro;
            # HEAD descarta o corpo e reduz falhas distintas a um 403 genérico.
            acl = self.client.get_bucket_acl(Bucket=self.bucket)
            for grant in acl.get('Grants', []):
                uri = grant.get('Grantee', {}).get('URI', '')
                if uri.endswith(('/AllUsers', '/AuthenticatedUsers')):
                    raise ValueError('O bucket do EGIDIUS deve ser privado.')

    def put_file(self, name, source, mime):
        with self.errors(), Path(source).open('rb') as body:
            self.client.put_object(Bucket=self.bucket, Key=self.key(name), Body=body,
                                   ContentLength=Path(source).stat().st_size, ContentType=mime,
                                   CacheControl='private, no-store')

    def remove(self, name):
        with self.errors():
            self.client.delete_object(Bucket=self.bucket, Key=self.key(name))

    def exists(self, name):
        from botocore.exceptions import ClientError
        with self.errors():
            try:
                self.client.head_object(Bucket=self.bucket, Key=self.key(name))
                return True
            except ClientError as error:
                if error.response.get('ResponseMetadata', {}).get('HTTPStatusCode') == 404:
                    return False
                raise

    def signed_url(self, name, mime, filename, document=False):
        from urllib.parse import quote
        disposition = 'attachment' if document else 'inline'
        with self.errors():
            return self.client.generate_presigned_url('get_object', Params={
                'Bucket': self.bucket, 'Key': self.key(name), 'ResponseContentType': mime,
                'ResponseContentDisposition': disposition + "; filename*=UTF-8''" + quote(filename, safe=''),
                'ResponseCacheControl': 'private, no-store',
            }, ExpiresIn=900 if mime.startswith('video/') else 120)

    def download(self, name, target, expected_size):
        with self.errors():
            response = self.client.get_object(Bucket=self.bucket, Key=self.key(name))
            body = response['Body']
            try:
                if response.get('ContentLength') != expected_size:
                    raise HTTPException(409, 'Tamanho de arquivo divergente no backup.')
                total = 0
                with Path(target).open('xb') as out:
                    for block in iter(lambda: body.read(128 * 1024), b''):
                        total += len(block)
                        if total > expected_size:
                            raise HTTPException(409, 'Arquivo alterado durante o backup.')
                        out.write(block)
                if total != expected_size:
                    raise HTTPException(409, 'Download incompleto durante o backup.')
            finally:
                body.close()


@lru_cache(maxsize=4)
def _s3(endpoint, bucket, access, secret, region, prefix):
    return S3Storage(endpoint, bucket, access, secret, region, prefix)


def get_storage():
    backend = os.getenv('EGIDIUS_STORAGE_BACKEND', 'local')
    if backend == 'local':
        from .media import root_dir
        return LocalStorage(root_dir())
    if backend != 's3':
        raise ValueError('Tipo de armazenamento não reconhecido.')
    return _s3(*(os.getenv(key, '') for key in (
        'EGIDIUS_S3_ENDPOINT', 'EGIDIUS_S3_BUCKET', 'EGIDIUS_S3_ACCESS_KEY_ID',
        'EGIDIUS_S3_SECRET_ACCESS_KEY', 'EGIDIUS_S3_REGION', 'EGIDIUS_S3_PREFIX')))


def reserve_quota(db, amount, quota):
    from sqlalchemy import select, func
    from .db import State, MediaAsset, PendingMediaDeletion
    cleanup_deletions(db)
    # Serializa reservas no PostgreSQL sem depender dos arquivos temporários locais.
    db.execute(select(State.id).where(State.id == 1).with_for_update()).scalar_one()
    used = db.scalar(select(func.coalesce(func.sum(MediaAsset.size), 0)))
    used += db.scalar(select(func.coalesce(func.sum(PendingMediaDeletion.size), 0)))
    if used + amount > quota:
        raise HTTPException(507, 'Espaço reservado para mídia esgotado. Faça backup antes de liberar espaço.')


def cleanup_deletions(db):
    from sqlalchemy import select
    from .db import PendingMediaDeletion
    storage = get_storage()
    for row in db.scalars(select(PendingMediaDeletion).limit(30)).all():
        try:
            storage.remove(row.stored_name)
        except Exception:
            continue
        db.delete(row)
    db.flush()
