"""add games.updated_at

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-25
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 기존 행이 있어도 적용되게 NULL 허용으로 추가 → created_at으로 채움 → NOT NULL로 변경
    op.add_column('games', sa.Column('updated_at', sa.DateTime(), nullable=True))
    op.execute("UPDATE games SET updated_at = created_at")
    op.alter_column('games', 'updated_at', existing_type=sa.DateTime(), nullable=False)


def downgrade() -> None:
    op.drop_column('games', 'updated_at')
