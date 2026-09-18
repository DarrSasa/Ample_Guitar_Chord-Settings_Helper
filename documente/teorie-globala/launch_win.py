#!/usr/bin/env python3
"""Launcher Windows-friendly pt. DeepAstra (fara bug-ul [WinError 2]).

launch.py original porneste `codex` fara shell=True; pe Windows codex e
`codex.cmd` si CreateProcess nu il gaseste -> [WinError 2]. Acest script face
exact ce trebuie pt. doctor/exec, dar cu shell=True si calea reala a lui codex.

Utilizare (CMD):
  py launch_win.py doctor --provider openrouter --key-file "...\cheia.txt"
  py launch_win.py exec --provider openrouter --cwd "..." --key-file "..." ^
     --prompt-file "..." --status-file "run-status.json" --timeout 900
"""
import argparse, json, os, shutil, subprocess, sys, time
from pathlib import Path

PROVIDERS = {
    "deepseek": ("https://api.deepseek.com", "deepseek-flash", "DEEPSEEK_API_KEY"),
    "openrouter": ("https://openrouter.ai/api/v1", "deepseek/deepseek-v4.1-flash", "OPENROUTER_API_KEY"),
}
CODEX = shutil.which("codex") or "codex"


def get_env(a):
    env = os.environ.copy()
    kn = PROVIDERS[a.provider][2]
    if a.key_file:
        key = Path(a.key_file).read_text().strip()
        if not key:
            raise ValueError("Fisierul de cheie e gol")
        env[kn] = key
    if not env.get(kn):
        raise ValueError("Seteaza " + kn + " sau --key-file")
    return env


def codex_version():
    return subprocess.check_output([CODEX, "--version"], text=True, shell=True).strip()


def build_cmd(a):
    endpoint, model, kn = PROVIDERS[a.provider]
    prov = "deepastra_" + a.provider
    opt = {
        "model_provider": prov, "model_reasoning_effort": "high",
        "model_providers." + prov + ".name": "DeepAstra " + a.provider,
        "model_providers." + prov + ".base_url": endpoint,
        "model_providers." + prov + ".wire_api": "responses",
        "model_providers." + prov + ".env_key": kn,
        "approval_policy": "never", "project_doc_max_bytes": 0,
        "shell_environment_policy.inherit": "core",
        "shell_environment_policy.exclude": ["*KEY*", "*TOKEN*", "*SECRET*"],
        "features.multi_agent": False,
    }
    cmd = [CODEX, "exec", "--ephemeral", "--skip-git-repo-check", "--json",
           "--ignore-user-config", "-C", str(Path(a.cwd).resolve()),
           "-s", "danger-full-access", "-m", model]
    for k, v in opt.items():
        cmd += ["-c", k + "=" + json.dumps(v)]
    cmd += ["-"]
    return cmd


def main():
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["doctor", "exec"])
    p.add_argument("--provider", choices=PROVIDERS, default="openrouter")
    p.add_argument("--cwd", default=".")
    p.add_argument("--key-file")
    p.add_argument("--prompt-file")
    p.add_argument("--status-file")
    p.add_argument("--timeout", type=int, default=900)
    a = p.parse_args()

    if not shutil.which("codex"):
        print("Codex CLI nu e instalat / nu e in PATH. Ruleaza: npm install -g @openai/codex")
        return 2

    if a.action == "doctor":
        get_env(a)
        print(json.dumps({"codex": codex_version(), "provider": a.provider,
                          "model": PROVIDERS[a.provider][1], "key_present": True}, indent=2))
        return 0

    env = get_env(a)
    prompt = Path(a.prompt_file).read_text(encoding="utf-8")
    base = {"state": "running", "provider": a.provider, "model": PROVIDERS[a.provider][1],
            "started_at": time.time()}
    if a.status_file:
        Path(a.status_file).write_text(json.dumps(base, indent=2))
    cmd = build_cmd(a)
    print("[launch_win] codex gasit la:", CODEX)
    print("[launch_win] pornesc codex exec (output live mai jos)...")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, env=env, shell=True)
    proc.stdin.write(prompt)
    proc.stdin.close()
    out = []
    try:
        for line in proc.stdout:
            print(line, end="")
            out.append(line)
        proc.wait(timeout=a.timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        print("[launch_win] TIMEOUT dupa", a.timeout, "s")
    rez = dict(base, state="completed" if proc.returncode == 0 else "failed",
               exit_code=proc.returncode)
    if a.status_file:
        Path(a.status_file).write_text(json.dumps(rez, indent=2))
    print("[launch_win] exit_code:", proc.returncode,
          "| status:", rez["state"], "(vezi", a.status_file, ")")
    return proc.returncode


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (ValueError, OSError) as e:
        print("DeepAstra-win: " + str(e)); sys.exit(1)
