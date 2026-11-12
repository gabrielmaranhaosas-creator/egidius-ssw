import io
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
import pytest
from botocore.response import StreamingBody
from botocore.stub import Stubber, ANY
from fastapi import HTTPException
from egidius_api.storage import S3Storage, LocalStorage, safe_name


@pytest.fixture
def s3():
    return S3Storage('https://storage.example.org', 'privado', 'teste-access', 'teste-secret', 'us-east-1', 'media')


def test_storage_nao_aceita_caminhos_ou_http(s3):
    for name in ('../x', '/tmp/x', 'a/b', 'a\\b', '.upload', 'x..pdf'):
        with pytest.raises(ValueError): safe_name(name)
    with pytest.raises(ValueError):
        S3Storage('http://example.org', 'b', 'a', 's', 'r', '')


def test_bucket_publico_e_recusado(s3):
    with Stubber(s3.client) as stub:
        stub.add_response('head_bucket', {}, {'Bucket': 'privado'})
        stub.add_response('get_bucket_acl', {'Grants': [
            {'Grantee': {'Type': 'Group', 'URI': 'http://acs.amazonaws.com/groups/global/AllUsers'}, 'Permission': 'READ'}
        ]}, {'Bucket': 'privado'})
        with pytest.raises(ValueError, match='privado'): s3.check()


def test_gravacao_privada_e_assinatura_temporaria(s3, tmp_path):
    source = tmp_path / 'a.pdf'; source.write_bytes(b'pdf')
    with Stubber(s3.client) as stub:
        stub.add_response('put_object', {}, {'Bucket': 'privado', 'Key': 'media/a.pdf', 'Body': ANY,
                          'ContentLength': 3, 'ContentType': 'application/pdf', 'CacheControl': 'private, no-store'})
        s3.put_file('a.pdf', source, 'application/pdf')
    url = s3.signed_url('a.pdf', 'application/pdf', 'Súmula.pdf', document=True)
    parsed = urlsplit(url); query = parse_qs(parsed.query)
    assert parsed.path == '/privado/media/a.pdf'
    assert query['X-Amz-Expires'] == ['120']
    assert 'attachment' in query['response-content-disposition'][0]
    assert 'ACL' not in query


def test_download_integro_e_falha_sem_vazar_resposta_sdk(s3, tmp_path):
    with Stubber(s3.client) as stub:
        stub.add_response('get_object', {'Body': StreamingBody(io.BytesIO(b'abc'), 3), 'ContentLength': 3},
                          {'Bucket': 'privado', 'Key': 'media/a.pdf'})
        s3.download('a.pdf', tmp_path / 'copiado', 3)
        assert (tmp_path / 'copiado').read_bytes() == b'abc'
        stub.add_client_error('head_bucket', service_error_code='AccessDenied',
                              service_message='SEGREDO_NAO_DEVE_APARECER', http_status_code=403)
        with pytest.raises(HTTPException) as failure: s3.check()
        assert failure.value.status_code == 503
        assert 'SEGREDO' not in str(failure.value.detail)
        assert 'HeadBucket: AccessDenied' in failure.value.detail


def test_diagnostico_nao_repete_codigo_desconhecido_do_provedor(s3):
    with Stubber(s3.client) as stub:
        stub.add_client_error('head_bucket', service_error_code='SEGREDO_EM_CODIGO',
                              service_message='SEGREDO_EM_MENSAGEM', http_status_code=403)
        with pytest.raises(HTTPException) as failure: s3.check()
        assert 'HeadBucket: StorageError' in failure.value.detail
        assert 'SEGREDO' not in failure.value.detail


def test_armazenamento_local_preserva_arquivo_existente(tmp_path):
    storage = LocalStorage(tmp_path / 'media')
    source = tmp_path / 'origem'; source.write_bytes(b'primeiro')
    storage.put_file('foto.jpg', source, 'image/jpeg')
    source.write_bytes(b'outro')
    with pytest.raises(FileExistsError): storage.put_file('foto.jpg', source, 'image/jpeg')
    assert storage.path('foto.jpg').read_bytes() == b'primeiro'
