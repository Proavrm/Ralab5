from app.services.demande_document_storage_service import (
    delete_affaire_document,
    normalize_document_storage_path,
    sanitize_filename,
    save_affaire_document,
    save_affaire_plan,
)


def test_sanitize_filename():
    assert sanitize_filename('Plan A.pdf') == 'Plan A.pdf'
    assert sanitize_filename('../../evil.pdf') == 'evil.pdf'
    assert sanitize_filename('') == 'document'


def test_normalize_document_storage_path():
    assert normalize_document_storage_path('documents/2026-RA-023/file.pdf', '2026-RA-023') == (
        'documents/2026-RA-023/file.pdf'
    )
    assert normalize_document_storage_path('storage/documents/2026-RA-023/file.pdf', '2026-RA-023') == (
        'documents/2026-RA-023/file.pdf'
    )
    assert normalize_document_storage_path('Documents/2026-RA-023/file.pdf', '2026-RA-023') == (
        'documents/2026-RA-023/file.pdf'
    )


def test_save_affaire_document(tmp_path, monkeypatch):
    import app.services.demande_document_storage_service as svc

    monkeypatch.setattr(svc, 'STORAGE_ROOT', tmp_path)
    result = save_affaire_document('2026-RA-023', b'hello', 'note.pdf')
    assert result['stored_path'] == 'documents/2026-RA-023/note.pdf'
    assert (tmp_path / 'documents' / '2026-RA-023' / 'note.pdf').read_bytes() == b'hello'
    assert result['url'] == '/api/storage/documents/2026-RA-023/note.pdf'


def test_delete_affaire_document(tmp_path, monkeypatch):
    import app.services.demande_document_storage_service as svc

    monkeypatch.setattr(svc, 'STORAGE_ROOT', tmp_path)
    save_affaire_document('2026-RA-023', b'hello', 'note.pdf')
    delete_affaire_document('documents/2026-RA-023/note.pdf', '2026-RA-023')
    assert not (tmp_path / 'documents' / '2026-RA-023' / 'note.pdf').exists()


def test_delete_affaire_document_rejects_other_affaire(tmp_path, monkeypatch):
    import app.services.demande_document_storage_service as svc

    monkeypatch.setattr(svc, 'STORAGE_ROOT', tmp_path)
    save_affaire_document('2026-RA-023', b'hello', 'note.pdf')
    try:
        delete_affaire_document('documents/2026-RA-023/note.pdf', '2026-RA-999')
        assert False, 'expected ValueError'
    except ValueError:
        pass


def test_save_affaire_plan_image(tmp_path, monkeypatch):
    import app.services.demande_document_storage_service as svc

    monkeypatch.setattr(svc, 'STORAGE_ROOT', tmp_path)
    png = (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
        b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01'
        b'\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    )
    result = save_affaire_plan('2026-RA-023', png, 'plan.png')
    assert result['stored_path'] == 'Plans/2026-RA-023/plan.png'
    assert result['converted_to_image'] is False
    assert (tmp_path / 'Plans' / '2026-RA-023' / 'plan.png').exists()


def test_delete_affaire_plan(tmp_path, monkeypatch):
    import app.services.demande_document_storage_service as svc

    monkeypatch.setattr(svc, 'STORAGE_ROOT', tmp_path)
    png = (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
        b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01'
        b'\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
    )
    save_affaire_plan('2026-RA-023', png, 'plan.png')
    delete_affaire_document('Plans/2026-RA-023/plan.png', '2026-RA-023')
    assert not (tmp_path / 'Plans' / '2026-RA-023' / 'plan.png').exists()
