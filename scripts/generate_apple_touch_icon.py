"""
Genera el apple-touch-icon.png (180x180) a partir del LogoReducido.svg.
Se usa fondo blanco para que el ícono se vea bien en iOS.
"""
import cairosvg
from PIL import Image
import io

SVG_PATH = "/home/ubuntu/webdev-static-assets/LogoReducido.svg"
OUTPUT_PATH = "/home/ubuntu/webdev-static-assets/apple-touch-icon.png"
SIZE = 180
PADDING = 20  # píxeles de margen alrededor del logo

# 1. Renderizar el SVG a PNG en alta resolución (2x para nitidez)
render_size = SIZE * 2
png_bytes = cairosvg.svg2png(
    url=SVG_PATH,
    output_width=render_size - PADDING * 2,
    output_height=render_size - PADDING * 2,
    background_color="white",
)

# 2. Abrir el PNG renderizado
logo_img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")

# 3. Crear lienzo blanco con padding
canvas = Image.new("RGBA", (render_size, render_size), (255, 255, 255, 255))
canvas.paste(logo_img, (PADDING * 2, PADDING * 2), logo_img)

# 4. Redimensionar a 180x180 con antialiasing
final = canvas.resize((SIZE, SIZE), Image.LANCZOS).convert("RGB")

# 5. Guardar
final.save(OUTPUT_PATH, "PNG", optimize=True)
print(f"Generado: {OUTPUT_PATH} ({SIZE}x{SIZE}px)")
