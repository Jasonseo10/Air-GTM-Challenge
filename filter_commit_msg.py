#!/usr/bin/env python3
import sys

# Read the commit message from stdin or file
if len(sys.argv) > 1:
    with open(sys.argv[1], 'r') as f:
        content = f.read()
else:
    content = sys.stdin.read()

# Remove lines with Co-Authored-By: Claude
lines = content.split('\n')
filtered_lines = [line for line in lines if not line.startswith('Co-Authored-By: Claude')]
result = '\n'.join(filtered_lines)

# Write back
if len(sys.argv) > 1:
    with open(sys.argv[1], 'w') as f:
        f.write(result)
else:
    sys.stdout.write(result)
