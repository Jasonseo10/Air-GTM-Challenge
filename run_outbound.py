"""
Outbound pipeline entrypoint — see src/outbound/run.py.

Mirrors the existing run_pipeline.py shape so reviewers can pattern-match.

Usage:
    py run_outbound.py                       # route + feedback
    py run_outbound.py --mode route          # match + bundle only
    py run_outbound.py --mode feedback       # refit + affinity only
"""

import sys
from src.outbound.run import main

if __name__ == "__main__":
    sys.exit(main())
