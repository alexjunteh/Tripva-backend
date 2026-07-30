from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from futurizta_capabilities.goldens import GoldenFixture, load_golden_set, verify_golden_set
from futurizta_creative import (
    AtomicZeroBudget,
    CreativeBrief,
    EvaluationResult,
    EvaluationVerdict,
    GeneratedArtifact,
    ReferencePack,
    SqliteAssetRegistry,
)
from futurizta_creative.contracts import GenerationRequest, ReferenceAsset


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _contained_file(root: Path, relative: str) -> Path:
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()) or not target.is_file():
        raise ValueError(f"required Tripva file is missing or escapes repository: {relative}")
    return target


def _canonical_sha256(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


@dataclass(frozen=True)
class TripvaGoldenCatalog:
    source_repository: Path
    fixtures: dict[str, GoldenFixture]

    @classmethod
    def load(cls, path: Path, expected_repository: Path) -> "TripvaGoldenCatalog":
        golden_path = path.resolve()
        golden_set = load_golden_set(golden_path)
        source = Path(golden_set.sourceRepository).expanduser()
        if not source.is_absolute():
            source = golden_path.parent / source
        source = source.resolve()
        if source != expected_repository.resolve():
            raise ValueError("Tripva golden source repository mismatch")
        errors = verify_golden_set(golden_path)
        if errors:
            raise ValueError(f"Tripva golden verification failed: {'; '.join(errors)}")
        fixtures = {fixture.id: fixture for fixture in golden_set.fixtures}
        if len(fixtures) != len(golden_set.fixtures):
            raise ValueError("Tripva golden fixture ids must be unique")
        return cls(source_repository=source, fixtures=fixtures)

    def path(self, fixture: GoldenFixture) -> Path:
        return _contained_file(self.source_repository, fixture.path)


@dataclass(frozen=True)
class TripvaReferencePolicy:
    catalog: TripvaGoldenCatalog

    def resolve(self, brief: CreativeBrief) -> ReferencePack:
        if brief.subject_id != "santorini":
            raise ValueError("unknown exact Tripva destination")
        fixture_id = brief.metadata.get("golden_fixture_id")
        fixture = self.catalog.fixtures.get(str(fixture_id))
        if fixture is None or fixture.subjectId != brief.subject_id:
            raise ValueError("Tripva fixture does not match destination")
        path = self.catalog.path(fixture)
        digest = _sha256(path)
        if digest != fixture.sha256:
            raise ValueError("Tripva destination reference checksum changed")
        version = _canonical_sha256(
            {"destination": brief.subject_id, "style": fixture.style, "sha256": digest}
        )
        return ReferencePack(
            id=f"tripva-destination:{brief.subject_id}",
            subject_id=brief.subject_id,
            version=version,
            locked=True,
            assets=(
                ReferenceAsset(
                    id=f"tripva-fixture-{digest[:16]}",
                    uri=fixture.path,
                    sha256=digest,
                    role="destination-editorial-reference",
                ),
            ),
        )


@dataclass(frozen=True)
class TripvaFixtureGenerator:
    catalog: TripvaGoldenCatalog

    def generate(self, request: GenerationRequest) -> GeneratedArtifact:
        fixture = self.catalog.fixtures.get(str(request.brief.metadata.get("golden_fixture_id")))
        if fixture is None or fixture.domain != "image":
            raise ValueError("known Tripva image fixture is required")
        self._validate_binding(request.brief, fixture)
        path = self.catalog.path(fixture)
        digest = _sha256(path)
        if digest != fixture.sha256:
            raise ValueError("Tripva fixture checksum changed")
        lineage = {
            "request": request.idempotency_key,
            "fixture": fixture.id,
            "sha256": digest,
            "reference_version": request.references.version,
            "attempt": request.attempt,
        }
        lineage_hash = _canonical_sha256(lineage)
        return GeneratedArtifact(
            id=f"tripva-shadow-{lineage_hash[:24]}",
            uri=path.as_uri(),
            sha256=digest,
            provider="tripva-local-fixture",
            provider_run_id=lineage_hash,
            cost_usd=0,
            metadata={**lineage, "shadow": True, "fixture_role": fixture.role},
        )

    @staticmethod
    def _validate_binding(brief: CreativeBrief, fixture: GoldenFixture) -> None:
        if (
            fixture.subjectId != brief.subject_id
            or fixture.style != brief.metadata.get("style")
            or fixture.colorway != brief.metadata.get("colorway")
        ):
            raise ValueError("Tripva fixture does not match exact brief binding")


@dataclass(frozen=True)
class TripvaEditorialEvaluator:
    catalog: TripvaGoldenCatalog

    def evaluate(
        self,
        brief: CreativeBrief,
        references: ReferencePack,
        artifact: GeneratedArtifact,
    ) -> EvaluationResult:
        fixture = self.catalog.fixtures.get(str(artifact.metadata.get("fixture")))
        if fixture is None:
            raise ValueError("artifact fixture is not allowlisted")
        TripvaFixtureGenerator._validate_binding(brief, fixture)
        path = self.catalog.path(fixture)
        if artifact.uri != path.as_uri() or artifact.sha256 != fixture.sha256 or _sha256(path) != fixture.sha256:
            raise ValueError("artifact identity does not match pinned fixture")
        if not references.locked or references.subject_id != brief.subject_id:
            raise ValueError("destination references do not match brief")

        failures: list[str] = []
        with Image.open(path) as image:
            image.load()
            width, height = image.size
            minimum_width = int(fixture.metadata.get("minWidth", 0))
            minimum_height = int(fixture.metadata.get("minHeight", 0))
            if width < minimum_width or height < minimum_height:
                failures.append("editorial_dimensions_below_minimum")
            ratio = width / height
            if not float(fixture.metadata.get("minAspect", 0)) <= ratio <= float(
                fixture.metadata.get("maxAspect", 99)
            ):
                failures.append("editorial_aspect_ratio_out_of_range")
            allowed_formats = {str(value) for value in fixture.metadata.get("allowedFormats", [])}
            if image.format not in allowed_formats:
                failures.append("editorial_format_required")

        evidence = {
            "fixture_id": fixture.id,
            "approval_scope": "destination-editorial-technical",
            "requires_human_editorial_review": fixture.metadata.get(
                "requiresHumanEditorialReview", True
            ),
            "width": width,
            "height": height,
            "aspect_ratio": ratio,
            "artifact_sha256": fixture.sha256,
            "reference_pack_version": references.version,
        }
        if fixture.role == "positive" and not failures:
            return EvaluationResult(
                verdict=EvaluationVerdict.NEEDS_REVIEW,
                evaluator="tripva-editorial-technical",
                evaluator_version="1.0.0",
                confidence=1,
                scores={"editorial_technical": 1},
                evidence=evidence,
            )
        if fixture.role == "negative":
            expected = tuple(str(value) for value in fixture.metadata.get("expectedFailures", []))
            if not expected or set(expected) != set(failures):
                return EvaluationResult(
                    verdict=EvaluationVerdict.ERROR,
                    evaluator="tripva-editorial-technical",
                    evaluator_version="1.0.0",
                    confidence=0,
                    hard_failures=("golden_negative_mismatch",),
                    evidence={**evidence, "actual_failures": failures, "expected_failures": expected},
                )
            return EvaluationResult(
                verdict=EvaluationVerdict.REJECT,
                evaluator="tripva-editorial-technical",
                evaluator_version="1.0.0",
                confidence=1,
                hard_failures=expected,
                evidence=evidence,
            )
        return EvaluationResult(
            verdict=EvaluationVerdict.REJECT,
            evaluator="tripva-editorial-technical",
            evaluator_version="1.0.0",
            confidence=1,
            hard_failures=tuple(failures) or ("positive_golden_failed",),
            evidence=evidence,
        )


TripvaZeroBudget = AtomicZeroBudget
TripvaAssetRegistry = SqliteAssetRegistry
