"""DB 테이블 정의 (docs/spec.md 5장). 바꾸면 Alembic 마이그레이션을 새로 만든다."""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Double, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def utcnow() -> datetime:
    # MySQL DATETIME은 시간대를 저장하지 않으므로 UTC 기준 naive 값으로 저장한다.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Status:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Experiment(Base):
    __tablename__ = "experiments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str | None] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(16), default=Status.PENDING, index=True)

    # 실험 설정 (엔진 요청값과 같은 이름)
    turns: Mapped[int] = mapped_column(Integer)
    sensor_error: Mapped[float] = mapped_column(Double)
    drop_rate: Mapped[float] = mapped_column(Double)
    flip_rate: Mapped[float] = mapped_column(Double)
    byzantine_count: Mapped[int] = mapped_column(Integer)
    seed: Mapped[int | None] = mapped_column(Integer)

    # 실행 결과 요약 (완료 시 채움)
    n_cities: Mapped[int] = mapped_column(Integer)
    byzantine_ids: Mapped[list[int] | None] = mapped_column(JSON)
    mean_accuracy: Mapped[float | None] = mapped_column(Double)
    error: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)

    turn_results: Mapped[list["TurnResult"]] = relationship(
        back_populates="experiment", cascade="all, delete-orphan", passive_deletes=True, order_by="TurnResult.turn"
    )


class TurnResult(Base):
    __tablename__ = "turn_results"
    __table_args__ = (UniqueConstraint("experiment_id", "turn", name="uq_turn_results_experiment_turn"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    experiment_id: Mapped[int] = mapped_column(ForeignKey("experiments.id", ondelete="CASCADE"))
    turn: Mapped[int] = mapped_column(Integer)
    truth: Mapped[str] = mapped_column(String(16))  # danger | safe
    accuracy: Mapped[float] = mapped_column(Double)

    experiment: Mapped[Experiment] = relationship(back_populates="turn_results")
    city_states: Mapped[list["CityState"]] = relationship(
        back_populates="turn_result", cascade="all, delete-orphan", passive_deletes=True, order_by="CityState.city"
    )


class CityState(Base):
    """한 턴의 도시 한 곳. 엔진이 보내는 cities[] 항목 그대로."""

    __tablename__ = "city_states"
    __table_args__ = (UniqueConstraint("turn_result_id", "city", name="uq_city_states_turn_city"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    turn_result_id: Mapped[int] = mapped_column(ForeignKey("turn_results.id", ondelete="CASCADE"))
    city: Mapped[int] = mapped_column(Integer)
    is_byzantine: Mapped[bool] = mapped_column(Boolean)
    hint: Mapped[str] = mapped_column(String(16))                  # danger | safe
    from_left: Mapped[str | None] = mapped_column(String(16))      # evacuate | stay | NULL(누락)
    from_right: Mapped[str | None] = mapped_column(String(16))
    decision: Mapped[str] = mapped_column(String(16))              # evacuate | stay
    to_left: Mapped[str] = mapped_column(String(16))               # normal | dropped | flipped
    to_right: Mapped[str] = mapped_column(String(16))

    turn_result: Mapped[TurnResult] = relationship(back_populates="city_states")
