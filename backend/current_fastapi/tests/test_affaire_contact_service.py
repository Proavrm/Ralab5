from app.services.affaire_contact_service import (
    build_contact_display_label,
    normalize_contact_key,
    parse_intervention_observations,
    _parse_contact_line,
    _looks_like_person_name,
    _contact_listing_keys,
    _is_already_listed,
    _is_junk_contact_text,
    _is_directory_quality,
)


def test_build_contact_display_label_structured():
    label = build_contact_display_label(
        full_name="Jean Dupont",
        role_label="MOE",
        organisation="SEGIC",
        phone="06 12 34 56 78",
        notes="8h-17h",
    )
    assert "Jean Dupont" in label
    assert "SEGIC" in label
    assert "06 12 34 56 78" in label


def test_normalize_contact_key_deduplicates_spacing():
    a = normalize_contact_key("Jean", "MOE", "SEGIC")
    b = normalize_contact_key(" jean ", " moe ", " segic ")
    assert a == b


def test_parse_intervention_observations_extracts_prep_contact():
    obs = parse_intervention_observations('{"prep_contact_chantier":"MOE SEGIC","prep_contact_id":12}')
    assert obs["prep_contact_chantier"] == "MOE SEGIC"
    assert obs["prep_contact_id"] == 12


def test_parse_contact_line_rejects_moa_company_line():
    assert _parse_contact_line("MOA : Lyon Métropole Habitats") == {}
    assert not _looks_like_person_name("MOA : Vienne-Condrieu Agglomération")


def test_parse_contact_line_parses_rst_role_line():
    parsed = _parse_contact_line("RST : Marco Costa Pereira")
    assert parsed["full_name"] == "Marco Costa Pereira"
    assert parsed["role_label"].upper() == "RST"
    assert _looks_like_person_name("Marco Costa Pereira")

    parsed = _parse_contact_line("Jean Dupont — MOE — SEGIC — 06 12 34 56 78")
    assert parsed["full_name"] == "Jean Dupont"
    assert parsed["role_label"] == "MOE"
    assert parsed["organisation"] == "SEGIC"
    assert "06" in parsed["phone"]


def test_contact_listing_skips_existing_name():
    index = {42: _contact_listing_keys({"full_name": "Marco Costa Pereira"})}
    assert _is_already_listed(index, 42, {"full_name": "Marco Costa Pereira", "role_label": "RST"})
    assert not _is_already_listed(index, 42, {"full_name": "Vincent Bacot", "role_label": "RST"})


def test_junk_contact_text_rejects_seed_case():
    text = "Cas de test inséré automatiquement pour validation du parcours métier complet."
    assert _is_junk_contact_text(text)
    assert not _is_directory_quality({"full_name": text, "role_label": "Contact demande", "phone": "", "email": ""})
