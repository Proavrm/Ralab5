from app.repositories.demande_documents_repository import parse_documents_fournis_list


def test_parse_documents_fournis_list_splits_commas() -> None:
    assert parse_documents_fournis_list("CCTP, Plans, ...") == ["CCTP", "Plans"]


def test_parse_documents_fournis_list_deduplicates() -> None:
    assert parse_documents_fournis_list("CCTP; CCTP\nPlans") == ["CCTP", "Plans"]
