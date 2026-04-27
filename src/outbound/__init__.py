"""
Outbound routing layer — additive to the existing product-led pipeline.

This package implements the outbound-first GTM motion: external trigger
signals (funding, exec hires, competitor stack changes, etc.), firmographic
+ persona scoring (deliberately *no* product-usage signals), rep matching
with qualitative fit, account-level multi-threading, and a closed-loop
feedback step that refits scoring weights and rep affinity from CRM
dispositions.

Public entrypoint: src/outbound/run.py (also accessible via run_outbound.py).
"""
