import re

s = open('assets/_cn.js', encoding='utf-8', errors='ignore').read()
print('Length:', len(s))

# Find JSON objects or arrays inside cn.js
# look for question text
# Often it assigns to window or has a list of questions
matches = re.findall(r'(\{[^{}]*["\']question["\'][^{}]*\})', s)
print('matches question:', len(matches))

# Let's search for "q": or "title": or Chinese question marks "？"
lines = [l for l in s.splitlines() if '？' in l or '?' in l]
print('Lines with question marks:', len(lines))
with open('assets/_questions_extracted.txt', 'w', encoding='utf-8') as f:
    for l in lines:
        f.write(l[:300] + '\n')
