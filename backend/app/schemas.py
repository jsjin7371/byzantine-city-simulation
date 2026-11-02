"""요청·응답 형식 (docs/spec.md 2~4장). Swagger 문서도 여기서 자동으로 만들어진다."""
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Decision = Literal["evacuate", "stay"]
Sensor = Literal["danger", "safe"]
StatusValue = Literal["pending", "running", "completed", "failed"]


# ---------- 실험 설정 ----------

class ExperimentConfig(BaseModel):
    turns: int = Field(20, ge=1, le=100, description="턴 수")
    sensor_error_rate: float = Field(0.1, ge=0.0, le=1.0, description="센서 오류율")
    drop_rate: float = Field(0.0, ge=0.0, le=1.0, description="메시지 누락률")
    tamper_rate: float = Field(0.0, ge=0.0, le=1.0, description="메시지 조작률")
    byzantine_count: int = Field(1, ge=0, description="비잔틴 도시 수 (도시 수 - 1 이하)")
    algorithm: str = Field("majority", min_length=1, max_length=32, description="합의 알고리즘")
    seed: int | None = Field(None, ge=0, le=2**31 - 1, description="랜덤 시드 (같으면 같은 결과)")


class ExperimentCreate(ExperimentConfig):
    name: str | None = Field(None, max_length=50, description="실험 이름")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "비잔틴 1개, 누락 10%",
                "turns": 20,
                "sensor_error_rate": 0.1,
                "drop_rate": 0.1,
                "tamper_rate": 0.0,
                "byzantine_count": 1,
                "algorithm": "majority",
                "seed": 42,
            }
        }
    )


class UTCModel(BaseModel):
    """DB의 naive UTC 시각을 '...Z' 형식으로 내보낸다."""

    @field_validator("*", mode="before")
    @classmethod
    def _attach_utc(cls, value):
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class ExperimentOut(UTCModel):
    id: int
    name: str | None
    status: StatusValue
    config: ExperimentConfig
    n_cities: int
    byzantine_ids: list[int]
    mean_accuracy: float | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


# ---------- 결과 조회 ----------

class TurnSummary(BaseModel):
    turn: int
    truth: Decision
    accuracy: float


class TurnListOut(BaseModel):
    experiment_id: int
    turns: list[TurnSummary]


class ReceivedMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_city: int = Field(serialization_alias="from", validation_alias="from")
    value: Decision | None
    dropped: bool
    tampered: bool


class CityTurnOut(BaseModel):
    city_id: int
    is_byzantine: bool
    sensor: Sensor
    decision: Decision
    broadcast: Decision
    correct: bool
    received: list[ReceivedMessage]


class TurnDetailOut(BaseModel):
    experiment_id: int
    turn: int
    truth: Decision
    accuracy: float
    cities: list[CityTurnOut]


class CompareItem(BaseModel):
    id: int
    name: str | None
    config: ExperimentConfig
    mean_accuracy: float | None
    accuracy: list[TurnSummary]


class CompareOut(BaseModel):
    experiments: list[CompareItem]


# ---------- God 규격 (API ↔ God) ----------

class GodCity(BaseModel):
    city_id: int = Field(ge=1)
    is_byzantine: bool
    sensor: Sensor
    decision: Decision
    broadcast: Decision


class GodMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_city: int = Field(alias="from", ge=1)
    to_city: int = Field(alias="to", ge=1)
    sent: Decision
    received: Decision | None
    dropped: bool = False
    tampered: bool = False


class GodTurn(BaseModel):
    turn: int = Field(ge=1)
    truth: Decision
    cities: list[GodCity] = Field(min_length=1)
    messages: list[GodMessage] = []
    accuracy: float | None = Field(None, ge=0.0, le=1.0, description="엔진이 직접 계산한 경우에만")


class GodResult(BaseModel):
    n_cities: int = Field(ge=1)
    byzantine_ids: list[int] = []
    turns: list[GodTurn] = Field(min_length=1)
