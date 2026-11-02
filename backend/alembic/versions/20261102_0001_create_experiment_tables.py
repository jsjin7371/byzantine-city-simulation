"""create experiment tables

Revision ID: 0001
Revises:
Create Date: 2026-11-02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('experiments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(length=50), nullable=True),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('turns', sa.Integer(), nullable=False),
    sa.Column('sensor_error_rate', sa.Double(), nullable=False),
    sa.Column('drop_rate', sa.Double(), nullable=False),
    sa.Column('tamper_rate', sa.Double(), nullable=False),
    sa.Column('byzantine_count', sa.Integer(), nullable=False),
    sa.Column('algorithm', sa.String(length=32), nullable=False),
    sa.Column('seed', sa.Integer(), nullable=True),
    sa.Column('n_cities', sa.Integer(), nullable=False),
    sa.Column('byzantine_ids', sa.JSON(), nullable=True),
    sa.Column('mean_accuracy', sa.Double(), nullable=True),
    sa.Column('error', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('started_at', sa.DateTime(), nullable=True),
    sa.Column('finished_at', sa.DateTime(), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_experiments_created_at'), 'experiments', ['created_at'], unique=False)
    op.create_index(op.f('ix_experiments_status'), 'experiments', ['status'], unique=False)
    op.create_table('turn_results',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('experiment_id', sa.Integer(), nullable=False),
    sa.Column('turn', sa.Integer(), nullable=False),
    sa.Column('truth', sa.String(length=16), nullable=False),
    sa.Column('accuracy', sa.Double(), nullable=False),
    sa.ForeignKeyConstraint(['experiment_id'], ['experiments.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('experiment_id', 'turn', name='uq_turn_results_experiment_turn')
    )
    op.create_table('city_states',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('turn_result_id', sa.Integer(), nullable=False),
    sa.Column('city_id', sa.Integer(), nullable=False),
    sa.Column('is_byzantine', sa.Boolean(), nullable=False),
    sa.Column('sensor', sa.String(length=16), nullable=False),
    sa.Column('decision', sa.String(length=16), nullable=False),
    sa.Column('broadcast', sa.String(length=16), nullable=False),
    sa.ForeignKeyConstraint(['turn_result_id'], ['turn_results.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('turn_result_id', 'city_id', name='uq_city_states_turn_city')
    )
    op.create_table('messages',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('turn_result_id', sa.Integer(), nullable=False),
    sa.Column('from_city', sa.Integer(), nullable=False),
    sa.Column('to_city', sa.Integer(), nullable=False),
    sa.Column('sent', sa.String(length=16), nullable=False),
    sa.Column('received', sa.String(length=16), nullable=True),
    sa.Column('dropped', sa.Boolean(), nullable=False),
    sa.Column('tampered', sa.Boolean(), nullable=False),
    sa.ForeignKeyConstraint(['turn_result_id'], ['turn_results.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_messages_turn_to', 'messages', ['turn_result_id', 'to_city'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_messages_turn_to', table_name='messages')
    op.drop_table('messages')
    op.drop_table('city_states')
    op.drop_table('turn_results')
    op.drop_index(op.f('ix_experiments_status'), table_name='experiments')
    op.drop_index(op.f('ix_experiments_created_at'), table_name='experiments')
    op.drop_table('experiments')
