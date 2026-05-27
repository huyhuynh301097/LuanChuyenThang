import json
import os

log_path = r"C:\Users\X1 gen 12\.gemini\antigravity-ide\brain\f29b2fc5-6d01-41d1-8bfc-26faa9215ad9\.system_generated\logs\transcript.jsonl"

print("Checking if log file exists:", os.path.exists(log_path))
if os.path.exists(log_path):
    with open(log_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        print(f"Total lines in log: {len(lines)}")
        
        # Search for interesting lines
        keywords = ["biểu đồ", "tròn", "pie", "nhom_san_luong", "100", "200", "300"]
        matches = []
        for i, line in enumerate(lines):
            try:
                data = json.loads(line)
                content = str(data.get("content", ""))
                tool_calls = str(data.get("tool_calls", ""))
                combined = content + " " + tool_calls
                if any(kw in combined for kw in keywords):
                    matches.append((i, data.get("type"), content[:300]))
            except Exception as e:
                pass
        
        print(f"Found {len(matches)} matching lines.")
        for idx, mtype, mcontent in matches[-40:]: # Print last 40 matches
            print(f"Line {idx} ({mtype}): {mcontent}")
