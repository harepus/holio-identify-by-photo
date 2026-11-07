import engine as eng

SHORT = ["SKU-1", "SKU-2", "SKU-3"]


def test_well_formed_answer_maps_letters_to_skus():
    j = eng.to_judgement({"pick": "B", "confidence": 0.9, "ranking": ["B", "A"], "name_words_on_pack": True,
                          "size_settled": True, "evidence": "x"}, SHORT)
    assert (j.pick, j.ranking) == ("SKU-2", ("SKU-2", "SKU-1"))


def test_missing_pick_is_unreadable_not_none():
    assert eng.to_judgement({"confidence": 0.9, "ranking": ["A"]}, SHORT) is None


def test_ranking_that_is_not_a_list_is_unreadable():
    assert eng.to_judgement({"pick": "A", "ranking": 5}, SHORT) is None


def test_answer_that_is_not_an_object_is_unreadable():
    assert eng.to_judgement(["A"], SHORT) is None


def test_explicit_none_stays_none():
    j = eng.to_judgement({"pick": "none", "confidence": 0.8, "ranking": ["A", "B"]}, SHORT)
    assert j.pick is None
