"""
Map cleaned leads to a Salesforce Lead object payload.

Salesforce's Lead standard object uses specific field names (FirstName,
LastName, Email, Company, etc.) and custom fields are suffixed with __c.
We emit:
  1. A CSV matching the standard Salesforce bulk upload template.
  2. A JSON array in the shape the REST composite API expects.

Salesforce Lead requires LastName and Company. If LastName is missing we
fall back to the email local-part (better than dropping the lead). If
Company is missing after enrichment, we use "Unknown" rather than drop —
the RevOps team can clean it manually or we can backfill later.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

from .normalize import split_name


# Map internal field -> Salesforce field name. Custom fields end in __c.
SF_FIELD_MAP = {
    "first_name": "FirstName",
    "last_name": "LastName",
    "email": "Email",
    "company": "Company",
    "title": "Title",
    "phone": "Phone",
    "source": "LeadSource",
    "country": "Country",
    "created_at": "CreatedDate",
    "industry": "Industry",
    "company_size_band": "NumberOfEmployees",  # SF has a picklist; using band is pragmatic
    "score": "Lead_Score__c",
    "tier": "Lead_Tier__c",
    "seniority_level": "Seniority__c",
    "estimated_revenue": "AnnualRevenue_Band__c",
    "enrichment_status": "Enrichment_Status__c",
    "data_quality_issues": "Data_Quality_Issues__c",
}


def to_salesforce_record(lead: dict) -> dict:
    """Produce a single SF Lead payload from an enriched, scored lead."""
    first, last = split_name(lead.get("name"))

    # SF requires LastName — fall back to email local part to avoid drops.
    if not last:
        last = first or (lead["email"].split("@", 1)[0] if lead.get("email") else "Unknown")
        first = None if first == last else first

    # SF requires Company — fall back to a sentinel.
    company = lead.get("company") or "Unknown"

    record = {
        "FirstName": first,
        "LastName": last,
        "Email": lead.get("email"),
        "Company": company,
        "Title": lead.get("title"),
        "Phone": lead.get("phone"),
        "LeadSource": lead.get("source"),
        "Country": lead.get("country"),
        "CreatedDate": lead.get("created_at"),
        "Industry": lead.get("industry"),
        "NumberOfEmployees": lead.get("company_size_band"),
        "Lead_Score__c": lead.get("score"),
        "Lead_Tier__c": lead.get("tier"),
        "Seniority__c": lead.get("seniority_level"),
        "AnnualRevenue_Band__c": lead.get("estimated_revenue"),
        "Enrichment_Status__c": lead.get("enrichment_status"),
        "Data_Quality_Issues__c": "; ".join(lead.get("data_quality_issues") or []) or None,
    }
    return record


def write_salesforce_csv(leads: list[dict], path: str | Path) -> None:
    """Bulk API CSV — first row is SF field names."""
    records = [to_salesforce_record(l) for l in leads]
    if not records:
        return
    fieldnames = list(records[0].keys())
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in records:
            writer.writerow(r)


def write_salesforce_json(leads: list[dict], path: str | Path) -> None:
    """REST composite payload — one Lead per element."""
    records = [to_salesforce_record(l) for l in leads]
    payload = {
        "allOrNone": False,
        "records": [
            {"attributes": {"type": "Lead"}, **r} for r in records
        ],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)


def write_field_mapping(path: str | Path) -> None:
    """Emit the internal -> SF mapping as a standalone reference doc."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(SF_FIELD_MAP, f, indent=2)
