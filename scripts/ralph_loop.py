import os
import re
import sys
from pathlib import Path

# ANSI colors
BLUE = "\033[94m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BOLD = "\033[1m"
RESET = "\033[0m"

def get_current_task():
    progress_file = Path("progress.txt")
    if not progress_file.exists():
        return None
    
    lines = progress_file.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        if "[ ]" in line:
            return {"index": i + 1, "task": line.replace("[ ]", "").strip()}
    return None

def get_loop_state():
    prd_file = Path("PRD.md")
    task = get_current_task()
    
    print(f"\n{BOLD}RALPH LOOP STATE{RESET}")
    print(f"{'='*30}")
    
    if task:
        print(f"{BOLD}NEXT TASK:{RESET} {YELLOW}#{task['index']} - {task['task']}{RESET}")
    else:
        print(f"{BOLD}NEXT TASK:{RESET} {GREEN}None (All tasks completed!){RESET}")
        
    # Check for health_check.py
    if Path("health_check.py").exists():
        print(f"{BOLD}SYSTEM HEALTH:{RESET} Active (Run 'python health_check.py' to verify)")
    else:
        print(f"{BOLD}SYSTEM HEALTH:{RESET} Unknown (health_check.py missing)")
    
    print(f"{'='*30}\n")

if __name__ == "__main__":
    try:
        get_loop_state()
    except Exception as e:
        print(f"{RED}Error orienting loop: {e}{RESET}")
        sys.exit(1)
