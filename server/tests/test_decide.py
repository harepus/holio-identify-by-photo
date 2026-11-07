from decide import Judgement, decide

STAGE1 = ("SKU-A", "SKU-B", "SKU-C", "SKU-D")


def judged(pick="SKU-B", confidence=0.9, ranking=("SKU-B", "SKU-C", "SKU-A"), words=True, size=True,
           evidence="The pack says 'Paprika' and '140 g'."):
    return Judgement(pick, confidence, ranking, words, size, evidence)


def test_confident_pick_with_both_checks_is_a_match():
    d = decide(judged(), STAGE1, "en")
    assert d.status == "match"
    assert d.candidates[0] == ("SKU-B", "most_likely")
    assert d.evidence == "The pack says 'Paprika' and '140 g'."


def test_confidence_exactly_at_threshold_is_a_match():
    assert decide(judged(confidence=0.7), STAGE1, "en").status == "match"


def test_confidence_below_threshold_is_choose():
    assert decide(judged(confidence=0.69), STAGE1, "en").status == "choose"


def test_a_failed_or_missing_self_check_is_choose():
    assert decide(judged(words=False), STAGE1, "en").status == "choose"
    assert decide(judged(size=False), STAGE1, "en").status == "choose"
    assert decide(judged(size=None), STAGE1, "en").status == "choose"


def test_no_pick_is_none_and_still_offers_three_candidates():
    d = decide(judged(pick=None, confidence=0.0, ranking=("SKU-C",)), STAGE1, "en")
    assert d.status == "none"
    assert d.candidates == (("SKU-C", "most_likely"), ("SKU-A", "possible"), ("SKU-B", "possible"))


def test_pick_leads_even_when_the_ranking_puts_it_lower():
    d = decide(judged(pick="SKU-C", ranking=("SKU-A", "SKU-C")), STAGE1, "en")
    assert [sku for sku, _ in d.candidates] == ["SKU-C", "SKU-A", "SKU-B"]


def test_short_ranking_is_filled_from_stage1_without_duplicates():
    d = decide(judged(ranking=("SKU-B",)), STAGE1, "en")
    assert [sku for sku, _ in d.candidates] == ["SKU-B", "SKU-A", "SKU-C"]
    assert [lk for _, lk in d.candidates] == ["most_likely", "possible", "possible"]


def test_fewer_than_three_known_products_gives_fewer_candidates():
    d = decide(judged(pick="SKU-A", ranking=("SKU-A",)), ("SKU-A",), "en")
    assert d.candidates == (("SKU-A", "most_likely"),)


def test_unreadable_answer_is_choose_from_stage1_in_the_locale():
    d = decide(None, STAGE1, "nb")
    assert d.status == "choose"
    assert [sku for sku, _ in d.candidates] == ["SKU-A", "SKU-B", "SKU-C"]
    assert "Svaret" in d.evidence
