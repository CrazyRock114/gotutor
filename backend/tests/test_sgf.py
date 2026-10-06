"""SGF 解析与坐标转换测试(不依赖 KataGo)。"""
import pytest

from app.sgf import parse_sgf, vertex_to_gtp


def test_vertex_conversion():
    # SGF 'pd' 在 19 路盘上 = GTP Q16(SGF 从上/左起,无 I 列)
    assert vertex_to_gtp(15, 15) == "Q16"
    assert vertex_to_gtp(0, 0) == "A1"
    assert vertex_to_gtp(18, 18) == "T19"


def test_parse_basic():
    sgf = b"(;GM[1]FF[4]SZ[19]KM[7.5]RU[Chinese]PB[\xe9\xbb\x91\xe6\xa3\x8b]PW[\xe7\x99\xbd\xe6\xa3\x8b];B[pd];W[pp];B[])"
    info = parse_sgf(sgf)
    assert info.board_size == 19
    assert info.komi == 7.5
    assert info.rules == "chinese"
    assert info.moves == [("B", "Q16"), ("W", "Q4"), ("B", None)]
    assert info.meta["PB"] == "黑棋"
    assert info.initial_player == "B"


def test_parse_handicap():
    sgf = b"(;GM[1]FF[4]SZ[19]HA[2]AB[dd][pp];W[cc];B[qc])"
    info = parse_sgf(sgf)
    assert info.handicap == 2
    assert sorted(info.initial_stones) == [("B", "D16"), ("B", "Q4")]
    assert info.initial_player == "W"
    # SGF 'cc' = 从上数第 3 行 → GTP C17
    assert info.moves[0] == ("W", "C17")


def test_parse_japanese_rules():
    sgf = b"(;GM[1]FF[4]SZ[19]RU[Japanese]KM[6.5];B[qq];W[rr])"
    info = parse_sgf(sgf)
    assert info.rules == "japanese"
    assert info.komi == 6.5


def test_parse_invalid():
    with pytest.raises(ValueError):
        parse_sgf(b"not an sgf at all")


def test_parse_empty_moves():
    # 仅摆子无着法 → moves 为空但 initial_stones 非空,应可解析
    sgf = b"(;GM[1]FF[4]SZ[9]AB[ee])"
    info = parse_sgf(sgf)
    assert info.moves == []
    assert info.initial_stones == [("B", "E5")]
