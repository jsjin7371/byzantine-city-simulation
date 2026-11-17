import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import Base
from app.main import create_app


@pytest.fixture
def make_client(tmp_path):
    """SQLite 파일 DB와 원하는 God(mock 또는 가짜 함수)으로 앱을 만든다."""

    def _make(run_god=None, n_cities=5):
        settings = Settings(database_url=f"sqlite:///{tmp_path / 'test.db'}", god_mode="mock", n_cities=n_cities)
        app = create_app(settings)
        Base.metadata.create_all(app.state.engine)
        if run_god is not None:
            app.state.run_god = run_god
        return TestClient(app)

    return _make


@pytest.fixture
def client(make_client):
    with make_client() as c:
        yield c
