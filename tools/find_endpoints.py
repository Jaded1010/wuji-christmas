s = open('assets/_gift.js', encoding='utf-8', errors='ignore').read()
lines = [l for l in s.splitlines() if 'quizzes' in l or 'questions' in l or 'visit' in l]
for l in lines:
    print(l.strip()[:200])
