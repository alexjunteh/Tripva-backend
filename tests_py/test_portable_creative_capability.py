from __future__ import annotations

import socket
import sqlite3
import subprocess
from pathlib import Path

import pytest

from futurizta_creative import PipelineStatus
from tripva_capabilities.creative_foundation.shadow import run_shadow_fixture


POSITIVE = "tripva-santorini-editorial-positive"
NEGATIVE = "tripva-favicon-editorial-negative"
REPOSITORY = Path(__file__).resolve().parents[1]


def test_positive_fixture_is_pending_human_editorial_review(tmp_path: Path) -> None:
    result = run_shadow_fixture(POSITIVE, tmp_path / "capability.db")

    assert result.status == PipelineStatus.NEEDS_REVIEW
    assert result.asset is not None
    assert result.asset.artifact.cost_usd == 0
    assert result.asset.evaluation.evidence["approval_scope"] == "destination-editorial-technical"
    assert result.asset.evaluation.evidence["requires_human_editorial_review"] is True
    assert result.asset.evaluation.evidence["width"] == 1920
    assert result.asset.evaluation.evidence["height"] == 960


def test_negative_fixture_rejects_exact_editorial_failures(tmp_path: Path) -> None:
    result = run_shadow_fixture(NEGATIVE, tmp_path / "capability.db")

    assert result.status == PipelineStatus.REJECTED
    assert result.asset is not None
    assert set(result.asset.evaluation.hard_failures) == {
        "editorial_dimensions_below_minimum",
        "editorial_aspect_ratio_out_of_range",
        "editorial_format_required",
    }


def test_review_result_replays_without_generation_or_second_budget(tmp_path: Path) -> None:
    database = tmp_path / "capability.db"
    first = run_shadow_fixture(POSITIVE, database)
    second = run_shadow_fixture(POSITIVE, database)

    assert first.status == PipelineStatus.NEEDS_REVIEW
    assert second.status == PipelineStatus.NEEDS_REVIEW
    assert second.reason == "idempotent_replay"
    assert second.attempts == 0
    with sqlite3.connect(database) as connection:
        reservations = connection.execute(
            "SELECT COUNT(*) FROM capability_budget_reservations"
        ).fetchone()[0]
    assert reservations == 1


def test_shadow_path_never_opens_socket_or_subprocess(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def forbidden(*args, **kwargs):
        raise AssertionError("Tripva shadow capability must not use network or subprocesses")

    monkeypatch.setattr(socket, "socket", forbidden)
    monkeypatch.setattr(subprocess, "run", forbidden)
    monkeypatch.setattr(subprocess, "Popen", forbidden)

    result = run_shadow_fixture(POSITIVE, tmp_path / "capability.db")
    assert result.status == PipelineStatus.NEEDS_REVIEW


def test_binding_denies_all_external_boundaries() -> None:
    binding = (REPOSITORY / "capability_bindings/creative-foundation.yaml").read_text()

    assert "enabled: false" in binding
    assert "network: denied" in binding
    assert "providerSpend: denied" in binding
    assert "productionWrites: denied" in binding
    assert "externalActions: denied" in binding
