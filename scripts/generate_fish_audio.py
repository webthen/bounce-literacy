# -*- coding: utf-8 -*-
"""
使用 Fish Audio (模型: 25aca46726ab4e65a626c2bbdce46c91, 免费模型: s2.1-pro-free) 批量生成语音文件
"""
import os
import sys
import json
import time
import subprocess
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor, as_completed

FISH_API_URL = "https://api.fish.audio/v1/tts"
FISH_API_KEY = os.getenv("FISH_API_KEY", "")
FISH_REFERENCE_ID = "25aca46726ab4e65a626c2bbdce46c91"
FISH_MODEL = "s2.1-pro-free"

UI_VOICES = {
    "vo_ready": "准备发射！",
    "vo_super": "太棒啦！一发即中！",
    "vo_clear": "恭喜过关！你真棒！",
    "vo_combo": "好厉害，连续命中！",
    "vo_intro": "点一点汉字卡片，听听它们怎么读吧！",
    "vo_win_review": "太棒啦！来复习一下本关认识的汉字吧！"
}

def synth_fish_tts(text: str, max_retries: int = 3) -> bytes:
    headers = {
        "Authorization": f"Bearer {FISH_API_KEY}",
        "Content-Type": "application/json",
        "model": FISH_MODEL
    }
    payload = json.dumps({
        "text": text,
        "reference_id": FISH_REFERENCE_ID,
        "format": "mp3",
        "normalize": True,
        "model": FISH_MODEL
    }).encode("utf-8")

    for attempt in range(max_retries):
        req = urllib.request.Request(FISH_API_URL, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
                if len(data) > 200:
                    return data
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2.0 * (attempt + 1))
            else:
                time.sleep(1.0)
        except Exception:
            time.sleep(1.0)
    return b""

def compress_for_miniprogram(src_path: str, dst_path: str, bitrate: str = "12k"):
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-i", src_path,
        "-ac", "1", "-ar", "16000", "-b:a", bitrate,
        dst_path
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def generate_ui_voices():
    print("=== Generating UI Voices with s2.1-pro-free ===")
    for name, text in UI_VOICES.items():
        pub_path = os.path.join("public", "audio", "voice", f"{name}.mp3")
        mini_path = os.path.join("miniprogram", "audio", "voice", f"{name}.mp3")
        os.makedirs(os.path.dirname(pub_path), exist_ok=True)
        
        audio_data = synth_fish_tts(text)
        if audio_data:
            with open(pub_path, "wb") as f:
                f.write(audio_data)
            compress_for_miniprogram(pub_path, mini_path, bitrate="16k")
            print(f"[OK] {name}: {text} ({len(audio_data)} bytes)")
        else:
            print(f"[FAIL] {name}: {text}")

def generate_words(limit: int = None, concurrency: int = 4):
    print("=== Generating Words Audio with s2.1-pro-free ===")
    words_file = os.path.join("scripts", "words_to_generate.json")
    if not os.path.exists(words_file):
        print("Error: words_to_generate.json not found!")
        return

    with open(words_file, "r", encoding="utf-8") as f:
        words_map = json.load(f)

    items = list(words_map.items())
    if limit:
        items = items[:limit]

    total = len(items)
    print(f"Total words to generate: {total}")

    success_count = 0
    fail_count = 0

    def process_item(item):
        ch, phrase = item
        text = f"{ch}，{phrase}！"
        code = f"u{ord(ch):04x}"
        pub_path = os.path.join("public", "audio", "words", f"{code}.mp3")
        pub_path_ch = os.path.join("public", "audio", "words", f"{ch}.mp3")
        mini_path = os.path.join("miniprogram", "audio", "words", f"{code}.mp3")
        os.makedirs(os.path.dirname(pub_path), exist_ok=True)

        audio_bytes = synth_fish_tts(text)
        if audio_bytes:
            with open(pub_path, "wb") as f:
                f.write(audio_bytes)
            with open(pub_path_ch, "wb") as f:
                f.write(audio_bytes)
            compress_for_miniprogram(pub_path, mini_path, bitrate="12k")
            return ch, True, len(audio_bytes)
        return ch, False, 0

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(process_item, item): item for item in items}
        for future in as_completed(futures):
            ch, ok, length = future.result()
            if ok:
                success_count += 1
            else:
                fail_count += 1
            done = success_count + fail_count
            if done % 20 == 0 or done == total:
                print(f"Progress: {done}/{total} ({done * 100 // total}%) - Success: {success_count}, Failed: {fail_count}")

    print(f"Generation complete! Success: {success_count}, Failed: {fail_count}")

if __name__ == "__main__":
    generate_ui_voices()
    concurrency = 4
    if len(sys.argv) > 1 and sys.argv[1] == "--words":
        generate_words(concurrency=concurrency)
