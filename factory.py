#!/usr/bin/env python3
"""Run company-factory from a clone without installing it:  python3 factory.py <command> ..."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from company_factory import cli  # noqa: E402

cli.CMD = f"python3 {Path(__file__).resolve()}"
cli.main()
