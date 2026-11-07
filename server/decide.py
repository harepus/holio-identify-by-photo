"""The status rule the arena measured: the judge ranks, code decides."""
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

CONF_MIN = 0.7
MAX_CANDIDATES = 3

Status = Literal["match", "choose", "none"]
Likelihood = Literal["most_likely", "possible"]
Locale = Literal["en", "nb"]

UNREADABLE_EVIDENCE: dict[Locale, str] = {
    "en": "The model's answer could not be read. These are the closest products by printed text and image.",
    "nb": "Svaret fra modellen kunne ikke leses. Dette er de nærmeste produktene etter trykt tekst og bilde.",
}


@dataclass(frozen=True)
class Judgement:
    """One judge answer with letters already mapped back to SKUs."""
    pick: str | None
    confidence: float
    ranking: tuple[str, ...]
    name_words_on_pack: bool | None
    size_settled: bool | None
    evidence: str


@dataclass(frozen=True)
class Decision:
    status: Status
    candidates: tuple[tuple[str, Likelihood], ...]
    evidence: str


def decide(judgement: Judgement | None, stage1: Sequence[str], locale: Locale) -> Decision:
    """`judgement` is None when the judge answered but its answer could not be parsed."""
    if judgement is None:
        return Decision("choose", _label(stage1), UNREADABLE_EVIDENCE[locale])
    if judgement.pick is None:
        status: Status = "none"
    elif (judgement.name_words_on_pack is True and judgement.size_settled is True
          and judgement.confidence >= CONF_MIN):
        status = "match"
    else:
        status = "choose"
    head = (judgement.pick,) if judgement.pick is not None else ()
    order = [*head, *judgement.ranking, *stage1]
    return Decision(status, _label(order), judgement.evidence or UNREADABLE_EVIDENCE[locale])


def _label(order: Sequence[str]) -> tuple[tuple[str, Likelihood], ...]:
    top = list(dict.fromkeys(order))[:MAX_CANDIDATES]
    return tuple((sku, "most_likely" if i == 0 else "possible") for i, sku in enumerate(top))
