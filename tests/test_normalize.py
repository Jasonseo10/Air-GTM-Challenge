"""
Focused tests for the trickiest normalizers. Run with:
    python -m unittest discover tests
"""

from datetime import date
import unittest

from src import normalize


class TestEmail(unittest.TestCase):
    def test_lowercases_and_strips(self):
        self.assertEqual(normalize.normalize_email(" Bob.Jones@Example.Com "),
                         "bob.jones@example.com")

    def test_rejects_missing_at(self):
        self.assertIsNone(normalize.normalize_email("missing-at-symbol.com"))

    def test_rejects_missing_tld(self):
        self.assertIsNone(normalize.normalize_email("emilychen@yahoo"))

    def test_rejects_missing_domain(self):
        self.assertIsNone(normalize.normalize_email("carol@"))

    def test_rejects_empty(self):
        self.assertIsNone(normalize.normalize_email(""))
        self.assertIsNone(normalize.normalize_email(None))


class TestName(unittest.TestCase):
    def test_title_case(self):
        self.assertEqual(normalize.normalize_name("BOB JONES"), "Bob Jones")
        self.assertEqual(normalize.normalize_name("  alice smith"), "Alice Smith")

    def test_single_token(self):
        self.assertEqual(normalize.normalize_name("carol"), "Carol")

    def test_blank_returns_none(self):
        self.assertIsNone(normalize.normalize_name("   "))
        self.assertIsNone(normalize.normalize_name(""))

    def test_split(self):
        self.assertEqual(normalize.split_name("Alice Anderson"),
                         ("Alice", "Anderson"))
        self.assertEqual(normalize.split_name("Carol"), ("Carol", None))


class TestTitle(unittest.TestCase):
    def test_expands_abbreviations(self):
        self.assertEqual(normalize.normalize_title("Sr. Eng"), "Senior Engineer")
        self.assertEqual(normalize.normalize_title("VP Mktg"), "VP Marketing")

    def test_preserves_c_level_caps(self):
        self.assertEqual(normalize.normalize_title("ceo"), "CEO")
        self.assertEqual(normalize.normalize_title("cto"), "CTO")

    def test_collapses_whitespace(self):
        self.assertEqual(normalize.normalize_title("product lead  "), "Product Lead")

    def test_head_of_sales(self):
        # Title-case convention: prepositions lowercase mid-title.
        self.assertEqual(normalize.normalize_title("head of sales"), "Head of Sales")
        self.assertEqual(normalize.normalize_title("HEAD OF SALES"), "Head of Sales")

    def test_first_word_capitalized_even_if_preposition(self):
        # Edge case: "Of Counsel" (legal title) — "Of" stays capitalized.
        self.assertEqual(normalize.normalize_title("of counsel"), "Of Counsel")


class TestPhone(unittest.TestCase):
    def test_formats_10_digit(self):
        self.assertEqual(normalize.normalize_phone("(123) 456-7890"),
                         "+1 (123) 456-7890")
        self.assertEqual(normalize.normalize_phone("123-456-7890"),
                         "+1 (123) 456-7890")

    def test_formats_11_digit(self):
        self.assertEqual(normalize.normalize_phone("+1 800 555 1212"),
                         "+1 (800) 555-1212")

    def test_rejects_placeholders(self):
        self.assertIsNone(normalize.normalize_phone("call me"))
        self.assertIsNone(normalize.normalize_phone("N/A"))
        self.assertIsNone(normalize.normalize_phone(""))

    def test_rejects_fragment(self):
        # 7 digits is not a complete NANP number
        self.assertIsNone(normalize.normalize_phone("5551212"))


class TestCountry(unittest.TestCase):
    def test_us_variants(self):
        self.assertEqual(normalize.normalize_country("US"), "United States")
        self.assertEqual(normalize.normalize_country("usa"), "United States")
        self.assertEqual(normalize.normalize_country("United States"), "United States")

    def test_ca_is_canada(self):
        # Assumption documented in README
        self.assertEqual(normalize.normalize_country("CA"), "Canada")

    def test_unknown_returns_none(self):
        self.assertIsNone(normalize.normalize_country("Atlantis"))


class TestDate(unittest.TestCase):
    TODAY = date(2026, 4, 15)

    def test_iso(self):
        self.assertEqual(normalize.normalize_date("2025-04-01", self.TODAY),
                         "2025-04-01")

    def test_dd_mmm_yyyy(self):
        self.assertEqual(normalize.normalize_date("19-Mar-2025", self.TODAY),
                         "2025-03-19")

    def test_slash_us(self):
        self.assertEqual(normalize.normalize_date("05/07/2025", self.TODAY),
                         "2025-05-07")

    def test_relative(self):
        self.assertEqual(normalize.normalize_date("12 days ago", self.TODAY),
                         "2026-04-03")

    def test_empty(self):
        self.assertIsNone(normalize.normalize_date("", self.TODAY))
        self.assertIsNone(normalize.normalize_date("   ", self.TODAY))


class TestCompany(unittest.TestCase):
    def test_air_variants_canonicalize(self):
        self.assertEqual(normalize.normalize_company("Air Inc"), "Air Inc")
        self.assertEqual(normalize.normalize_company("Air.Inc"), "Air Inc")
        self.assertEqual(normalize.normalize_company("air inc"), "Air Inc")

    def test_example_corp_variants(self):
        self.assertEqual(normalize.normalize_company("example corp"), "Example Corp")
        self.assertEqual(normalize.normalize_company("Example Corp"), "Example Corp")

    def test_blank(self):
        self.assertIsNone(normalize.normalize_company("   "))
        self.assertIsNone(normalize.normalize_company(""))


if __name__ == "__main__":
    unittest.main()
