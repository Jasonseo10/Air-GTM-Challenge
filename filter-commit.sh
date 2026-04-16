#!/bin/bash
sed '/^Co-Authored-By: Claude/d' "$1" > "$1.tmp" && mv "$1.tmp" "$1"
