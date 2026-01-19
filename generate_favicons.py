# generate_favicons.py
from PIL import Image
from pathlib import Path

SRC = Path("static/favicon-source.png")
OUT = Path("static")

def save_png(img, name, size):    
    im = img.copy().resize((size, size), Image.LANCZOS)
    im.save(OUT / name, format="PNG")

def main():
    if not SRC.exists():
        raise SystemExit("No se encontró static/favicon-source.png")

    img = Image.open(SRC).convert("RGBA")

    # Asegurar cuadrado
    w, h = img.size
    if w != h:
        side = max(w, h)
        bg = Image.new("RGBA", (side, side), (255, 255, 255, 0))
        bg.paste(img, ((side - w)//2, (side - h)//2))
        img = bg

    # PNGs típicos
    save_png(img, "apple-touch-icon.png", 180)
    save_png(img, "favicon-32x32.png", 32)
    save_png(img, "favicon-16x16.png", 16)
    save_png(img, "android-chrome-192x192.png", 192)
    save_png(img, "android-chrome-512x512.png", 512)

    # ICO multiresolución (16/32/48)
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    img.save(OUT / "favicon.ico", sizes=ico_sizes)

    print("Favicons generados en /static.")

if __name__ == "__main__":
    main()