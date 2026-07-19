from __future__ import annotations

import argparse
import json
from pathlib import Path

from futurizta_creative import CreativeBrief, ImagePipeline, PipelineResult

from .adapters import (
    TripvaAssetRegistry,
    TripvaEditorialEvaluator,
    TripvaFixtureGenerator,
    TripvaGoldenCatalog,
    TripvaReferencePolicy,
    TripvaZeroBudget,
)


REPOSITORY = Path(__file__).resolve().parents[2]


def build_shadow_pipeline(database: Path) -> tuple[ImagePipeline, TripvaGoldenCatalog]:
    catalog = TripvaGoldenCatalog.load(
        REPOSITORY / "capability_bindings" / "tripva-creative-goldens.yaml",
        REPOSITORY,
    )
    return (
        ImagePipeline(
            references=TripvaReferencePolicy(catalog),
            budget=TripvaZeroBudget(database),
            generator=TripvaFixtureGenerator(catalog),
            evaluator=TripvaEditorialEvaluator(catalog),
            registry=TripvaAssetRegistry(database),
            max_attempts=1,
        ),
        catalog,
    )


def run_shadow_fixture(fixture_id: str, database: Path) -> PipelineResult:
    pipeline, catalog = build_shadow_pipeline(database)
    fixture = catalog.fixtures.get(fixture_id)
    if fixture is None or not fixture.subjectId or not fixture.style or not fixture.colorway:
        raise ValueError("Tripva fixture binding is incomplete")
    brief = CreativeBrief(
        id=f"tripva-shadow-{fixture_id}",
        idempotency_key=f"tripva-shadow:{fixture_id}",
        subject_id=fixture.subjectId,
        objective="Verify Tripva destination editorial capability without generation or provider calls",
        channel="tripva-shadow-test",
        requested_by="portable-capability-smoke",
        angle="destination-editorial",
        metadata={
            "golden_fixture_id": fixture.id,
            "style": fixture.style,
            "colorway": fixture.colorway,
        },
    )
    return pipeline.run(brief)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the zero-spend Tripva creative shadow fixture")
    parser.add_argument("fixture_id")
    parser.add_argument("--database", type=Path, default=Path("/tmp/tripva-creative-shadow.db"))
    args = parser.parse_args()
    result = run_shadow_fixture(args.fixture_id, args.database)
    print(json.dumps(result.model_dump(mode="json"), indent=2))
    return 0 if result.status.value in {"approved", "rejected", "needs_review"} else 1


if __name__ == "__main__":
    raise SystemExit(main())
