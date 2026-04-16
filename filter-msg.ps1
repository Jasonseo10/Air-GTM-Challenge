# Read stdin and remove Co-Authored-By lines
$content = [System.IO.File]::ReadAllText('COMMIT_EDITMSG')
$filtered = $content -replace "(?m)^Co-Authored-By: Claude.*`r?`n?", ""
[System.IO.File]::WriteAllText('COMMIT_EDITMSG', $filtered)
