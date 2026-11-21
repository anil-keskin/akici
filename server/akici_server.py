"""Akıcı yerel sunucusu.

- app/dist içindeki uygulamayı sunar.
- POST /api/score : mikrofon sesini BU BİLGİSAYARDA Whisper ile çözer (ses diske kalıcı yazılmaz, internete gitmez).
- POST /api/chat  : AI öğretmen için yerel Ollama'ya aracılık eder (metin bilgisayardan çıkmaz).
- GET  /api/health: durum.

Güvenlik (docs/guvenlik-tasarimi.md):
- Varsayılan sadece 127.0.0.1. --lan ile ağa açılır ve API için rastgele erişim kodu zorunlu olur.
- Başka sitelerden gelen istekler (Origin farklı) kod olmadan reddedilir (CSRF / DNS rebinding).
- Boyut sınırları, hız sınırı, sıkı CSP.

Çalıştırma: baslat.bat  |  baslat-lan.bat
"""
import argparse
import ipaddress
import json
import os
import secrets
import socket
import sys
import tempfile
import threading
import time
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "app" / "dist"
OLLAMA = os.environ.get("OLLAMA_HOST_URL", "http://127.0.0.1:11434")
MAX_AUDIO = 3 * 1024 * 1024
MAX_JSON = 200 * 1024
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; "
       "font-src 'self' data:; connect-src 'self' http: https:; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
CUDA_DLL_DIRS = [r"E:\AI\envs\chatterbox\Lib\site-packages\torch\lib", r"E:\AI\envs\img\Lib\site-packages\torch\lib"]

TOKEN = ""
LAN = False

# ------------------------------------------------------------------ Whisper
model = None
model_info = "yükleniyor"
model_lock = threading.Lock()


def load_model(device: str):
    global model, model_info
    os.environ.setdefault("HF_HOME", r"E:\AI\hf")
    try:
        import numpy as np
        from faster_whisper import WhisperModel
    except Exception as e:  # ortamda yok
        model_info = f"yok ({type(e).__name__})"
        return
    if device in ("auto", "cuda"):
        for d in CUDA_DLL_DIRS:
            if os.path.isdir(d):
                os.add_dll_directory(d)
                os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")
                break
        try:
            m = WhisperModel("mobiuslabsgmbh/faster-whisper-large-v3-turbo", device="cuda", compute_type="float16")
            list(m.transcribe(np.zeros(16000, dtype=np.float32), language="en")[0])
            model, model_info = m, "large-v3-turbo (GPU)"
            print("Whisper hazır:", model_info, flush=True)
            return
        except Exception as e:
            print("GPU kullanılamadı, CPU'ya geçiliyor:", type(e).__name__, flush=True)
    try:
        model = WhisperModel("Systran/faster-whisper-small.en", device="cpu", compute_type="int8")
        model_info = "small.en (CPU)"
    except Exception as e:
        model_info = f"hata ({type(e).__name__})"
    print("Whisper:", model_info, flush=True)


def decode_audio(path: str):
    """Sesi 16 kHz mono float32'ye çevirir (faster-whisper'ın kendi çözücüsü kurulu PyAV sürümüyle uyumsuz)."""
    import av
    import numpy as np
    from av.audio.resampler import AudioResampler

    rs = AudioResampler(format="s16", layout="mono", rate=16000)
    parts = []
    with av.open(path) as container:
        for frame in container.decode(audio=0):
            for f in rs.resample(frame):
                parts.append(f.to_ndarray().reshape(-1))
        for f in rs.resample(None):
            parts.append(f.to_ndarray().reshape(-1))
    if not parts:
        return np.zeros(0, dtype=np.float32)
    audio = np.concatenate(parts).astype(np.float32) / 32768.0
    return audio[: 16000 * 30]  # en fazla 30 sn


def transcribe(data: bytes):
    if model is None:
        raise RuntimeError("Whisper hazır değil: " + model_info)
    # Geçici dosya: sadece çözme süresince, sonra hemen silinir.
    fd, path = tempfile.mkstemp(suffix=".webm")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
        audio = decode_audio(path)
        with model_lock:
            segs, _ = model.transcribe(audio, language="en", word_timestamps=True, vad_filter=True, beam_size=5,
                                       condition_on_previous_text=False)
            words = []
            text = []
            for s in segs:
                text.append(s.text)
                for w in s.words or []:
                    words.append({"w": w.word.strip(), "p": round(float(w.probability), 3)})
        return {"text": " ".join(t.strip() for t in text).strip(), "words": words}
    finally:
        try:
            os.remove(path)
        except OSError:
            pass


# ------------------------------------------------------------------ Ollama
def ollama_models():
    try:
        with urllib.request.urlopen(OLLAMA + "/api/tags", timeout=2) as r:
            return [m["name"] for m in json.loads(r.read()).get("models", [])]
    except Exception:
        return None


def ollama_chat(model_name: str, messages: list, max_tokens: int, as_json: bool = False):
    payload = {"model": model_name, "messages": messages, "stream": False, "think": False, "keep_alive": "30m",
               "options": {"num_predict": max(50, min(int(max_tokens), 1500)), "temperature": 0.7, "num_ctx": 8192}}
    if as_json:
        payload["format"] = "json"
    body = json.dumps(payload).encode()
    req = urllib.request.Request(OLLAMA + "/api/chat", body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())["message"]["content"]


# ------------------------------------------------------------------ hız sınırı
_hits: dict = {}


def rate_ok(ip: str, limit=40, per=60.0) -> bool:
    now = time.time()
    q = [t for t in _hits.get(ip, []) if now - t < per]
    q.append(now)
    _hits[ip] = q
    return len(q) <= limit


class Handler(SimpleHTTPRequestHandler):
    server_version = "Akici"
    sys_version = ""
    protocol_version = "HTTP/1.1"  # service worker ve keep-alive için

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(DIST), **kw)

    def log_message(self, fmt, *args):  # kişisel veri loglanmaz: sadece yol ve durum
        if self.path.startswith("/api/"):
            sys.stdout.write("%s %s\n" % (self.command, self.path.split("?")[0]))

    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "microphone=(self), camera=(), geolocation=()")
        if self.path.endswith((".json",)) or "/assets/" in self.path:
            self.send_header("Cache-Control", "public, max-age=3600")
        super().end_headers()

    # --- güvenlik kontrolleri
    def client_is_local(self) -> bool:
        try:
            return ipaddress.ip_address(self.client_address[0]).is_loopback
        except ValueError:
            return False

    def authorized(self) -> bool:
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        same_origin = origin is None or origin.split("://", 1)[-1] == host
        token_ok = bool(TOKEN) and secrets.compare_digest(self.headers.get("X-Akici-Token", ""), TOKEN)
        if self.client_is_local() and same_origin and host.split(":")[0] in ("127.0.0.1", "localhost"):
            return True
        return token_ok

    def send_json(self, code: int, obj):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        # Çapraz köken API isteği (ör. Android uygulaması) sadece erişim koduyla; CORS yalnız LAN modunda açılır.
        self.send_response(204)
        if LAN:
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Akici-Token")
            self.send_header("Access-Control-Allow-Methods", "GET, POST")
            self.send_header("Vary", "Origin")
        self.end_headers()

    def cors(self):
        if LAN and self.headers.get("Origin"):
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Vary", "Origin")

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/api/health":
            if not self.authorized():
                return self.send_json(403, {"error": "erişim kodu gerekli"})
            models = ollama_models()
            return self.send_json(200, {"whisper": model_info, "ollama": models is not None, "models": models or []})
        if any(seg.startswith(".") for seg in p.split("/")):
            return self.send_error(404)
        if not (DIST / p.lstrip("/")).exists() and not p.startswith("/api/"):
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        p = self.path.split("?")[0]
        if not self.authorized():
            return self.send_json(403, {"error": "erişim kodu gerekli"})
        if not rate_ok(self.client_address[0]):
            return self.send_json(429, {"error": "çok fazla istek, biraz bekle"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_json(400, {"error": "geçersiz uzunluk"})
        if p == "/api/score":
            if n <= 0 or n > MAX_AUDIO:
                return self.send_json(413, {"error": "ses en fazla 3 MB"})
            data = self.rfile.read(n)
            try:
                return self.send_json(200, transcribe(data))
            except Exception as e:
                return self.send_json(503, {"error": str(e)[:200]})
        if p == "/api/chat":
            if n <= 0 or n > MAX_JSON or "application/json" not in self.headers.get("Content-Type", ""):
                return self.send_json(400, {"error": "geçersiz istek"})
            try:
                req = json.loads(self.rfile.read(n))
                msgs = [{"role": m["role"], "content": str(m["content"])[:6000]} for m in req.get("messages", [])[-24:]
                        if m.get("role") in ("system", "user", "assistant")]
                models = ollama_models()
                if models is None:
                    return self.send_json(503, {"error": "Ollama kapalı. Ollama'yı başlat."})
                name = req.get("model") or "qwen3:8b"
                if name not in models:
                    return self.send_json(400, {"error": f"Model yüklü değil: {name}. Yüklü: {', '.join(models)}"})
                return self.send_json(200, {"content": ollama_chat(name, msgs, req.get("max_tokens", 600), bool(req.get("json")))})
            except Exception as e:
                return self.send_json(500, {"error": f"{type(e).__name__}: {str(e)[:200]}"})
        return self.send_json(404, {"error": "yok"})


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    global TOKEN, LAN
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8790)
    ap.add_argument("--lan", action="store_true", help="aynı ağdaki telefona aç (erişim kodu zorunlu)")
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    ap.add_argument("--no-whisper", action="store_true")
    a = ap.parse_args()
    if not DIST.exists():
        print("app/dist yok. Önce: cd app && npm run build")
        sys.exit(1)
    LAN = a.lan
    if LAN:
        TOKEN = secrets.token_urlsafe(9)
    host = "0.0.0.0" if LAN else "127.0.0.1"
    if not a.no_whisper:
        threading.Thread(target=load_model, args=(a.device,), daemon=True).start()
    else:
        global model_info
        model_info = "kapalı"
    srv = ThreadingHTTPServer((host, a.port), Handler)
    print(f"Akıcı çalışıyor: http://127.0.0.1:{a.port}/", flush=True)
    if LAN:
        print(f"Telefondan: http://{lan_ip()}:{a.port}/   Erişim kodu: {TOKEN}", flush=True)
        print("(Kodu uygulamada Ayarlar → Yerel sunucu'ya gir. Pencereyi kapatınca sunucu durur.)", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
