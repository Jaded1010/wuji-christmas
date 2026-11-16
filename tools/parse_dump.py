import re
import html as html_lib

s = open('assets/_chat_dump.html', encoding='utf-8', errors='ignore').read()
code_blocks = re.findall(r'<pre[^>]*><code[^>]*>(.*?)</code></pre>', s, re.S)
print('Code blocks:', len(code_blocks))
for i, c in enumerate(code_blocks):
    unescaped = html_lib.unescape(c)
    with open(f'assets/_code_{i}.txt', 'w', encoding='utf-8') as f:
        f.write(unescaped)
    print(f'Block {i}: length {len(unescaped)}, snippet: {unescaped[:150]}...')

# Also check for user / assistant messages
msgs = re.findall(r'data-message-author-role="([^"]+)"[^>]*>(.*?)</div', s, re.S)
print('Messages found:', len(msgs))
