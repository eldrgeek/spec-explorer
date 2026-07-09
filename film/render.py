#!/usr/bin/env python3
import json, sys, urllib.request, pathlib

API = "http://localhost:4100"
PID = "spec-explorer"
FOUNTAIN = pathlib.Path(__file__).with_name("spec-explorer-walkthrough.fountain").read_text()
GEORGE = {"provider": "elevenlabs", "voiceId": "JBFqnCBsd6RMkjVDRZzb",
          "voiceName": "George", "register": "warm British storyteller"}

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(API + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=1200) as resp:
            return resp.status, json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

# 1. Create project (idempotent — ignore 409 already-exists)
st, body = req("POST", "/api/projects",
               {"id": PID, "site": "Spec Explorer", "baseUrl": "http://localhost:4200",
                "tier": "visitor", "voice": GEORGE})
print("create:", st, body if st >= 400 else "ok")

# 2. Fetch, attach fountainDoc, PUT back (body must carry segments[])
st, proj = req("GET", f"/api/projects/{PID}")
print("get:", st)
proj["fountainDoc"] = FOUNTAIN
proj.setdefault("segments", [])
st, body = req("PUT", f"/api/projects/{PID}", proj)
print("put fountainDoc:", st, body)

# 3. Render the whole film
print("rendering film (this can take a few minutes)...")
st, body = req("POST", f"/api/projects/{PID}/render-film",
               {"cast": [{"name": "GEORGE", "voiceId": GEORGE["voiceId"]}]})
print("render-film:", st)
print(json.dumps(body, indent=2)[:2000])
