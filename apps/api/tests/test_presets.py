from app.api.v1.presets import _find_presets_dir, load_presets


def test_presets_endpoint_returns_a_list(client):
    response = client.get("/api/v1/presets")

    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_presets_folder_is_discoverable():
    assert _find_presets_dir() is not None


def test_presets_have_required_fields():
    presets = load_presets()

    assert len(presets) >= 2
    for preset in presets:
        assert preset["id"]
        assert preset["name"]
        assert isinstance(preset["rules"], list)
