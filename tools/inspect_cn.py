import re

s = open('assets/_cn.js', encoding='utf-8', errors='ignore').read()
keys = re.findall(r'"([a-zA-Z0-9_-]+)":', s)
print('Total keys:', len(keys))
for k in ['questions', 'quiz', 'pool', 'items', 'list', 'data', 'moods', 'cards', 'options']:
    if k in keys:
        print('KEY:', k)

# search for Chinese text inside quotes
quotes = re.findall(r'"([^"\\]*[\u4e00-\u9fa5]+[^"\\]*)"', s)
print('Chinese quotes count:', len(quotes))
with open('assets/_cn_quotes.txt', 'w', encoding='utf-8') as f:
    for q in quotes:
        f.write(q + '\n')
print('Sample chinese quotes:')
for q in quotes[:30]:
    print('  ', q)
