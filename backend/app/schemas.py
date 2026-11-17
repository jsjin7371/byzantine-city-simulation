"""요청·응답 형식 (docs/spec.md 2~4장). Swagger 문서도 여기서 자동으로 만들어진다."""
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Truth = Literal["danger", "safe"]
Decision = Literal["evacuate", "stay"]
SendStatus = Literal["normal", "dropped", "flipped"]
StatusValue = Literal["pending", "running", "completed", "failed"]

# 정답(danger/safe)과 결정(evacuate/stay)의 대응: 위험하면 대피가 정답
CORRECT_DECISION = {"danger": "evacuate", "safe": "stay"}


# ---------- 실험 설정 (엔진 요청값과 같은 이름) ----------

class ExperimentConfig(BaseModel):
    turns: int = Field(10, ge=1, le=20, description="턴 수")
    sensor_error: float = Field(0.1, ge=0.0, le=1.0, description="신이 틀린 힌트를 줄 확률")
    drop_rate: float = Field(0.0, ge=0.0, le=1.0, description="메시지 누락 확률")
    flip_rate: float = Field(0.0, ge=0.0, le=1.0, description="메시지 조작 확률")
    byzantine_count: int = Field(1, ge=0, description="비잔틴(거짓말) 도시 수 (0 ~ 도시 수)")
    seed: int | None = Field(None, ge=0, le=2**31 - 1, description="랜덤 시드. 같으면 같은 결과, null이면 매번 랜덤")


class ExperimentCreate(ExperimentConfig):
    name: str | None = Field(None, max_length=50, description="실험 이름")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "비잔틴 1개, 누락 10%",
                "turns": 10,
                "sensor_error": 0.1,
                "drop_rate": 0.1,
                "flip_rate": 0.0,
                "byzantine_count": 1,
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
    completed_turns: int = Field(description="지금까지 저장된 턴 수 (진행률 표시용)")
    byzantine_ids: list[int]
    mean_accuracy: float | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None


# ---------- 결과 조회 ----------

class TurnSummary(BaseModel):
    turn: int
    truth: Truth
    accuracy: float


class TurnListOut(BaseModel):
    experiment_id: int
    turns: list[TurnSummary]


class CityTurn(BaseModel):
    """엔진이 보내는 도시 한 곳의 한 턴 결과. 프론트 응답에도 같은 이름을 쓴다."""

    model_config = ConfigDict(extra="ignore")

    city: int = Field(ge=1)
    is_byzantine: bool
    hint: Truth
    from_left: Decision | None
    from_right: Decision | None
    decision: Decision
    to_left: SendStatus
    to_right: SendStatus


class CityTurnOut(CityTurn):
    correct: bool = Field(description="결정이 정답과 맞는지 (danger→evacuate, safe→stay)")


class TurnDetailOut(BaseModel):
    experiment_id: int
    turn: int
    truth: Truth
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


# ---------- 엔진 → API ----------

class EngineTurn(BaseModel):
    """엔진이 턴마다 보내는 JSON (docs/spec.md 4장)."""

    model_config = ConfigDict(extra="ignore")

    turn: int = Field(ge=1)
    truth: Truth
    accuracy: float | None = Field(None, ge=0.0, le=1.0, description="없으면 API가 계산")
    cities: list[CityTurn] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_cities(self):
        ids = [c.city for c in self.cities]
        if len(ids) != len(set(ids)):
            raise ValueError("cities에 같은 도시 번호가 두 번 이상 있습니다")
        return self


class TurnAck(BaseModel):
    ok: bool = True
    experiment_id: int
    turn: int
