#!/usr/bin/env python3

import base64
import io
import json
import math
import sys
from PIL import Image, ImageDraw, ImageFont


def text_bbox(draw, text, font):
    if not text:
        return (0, 0, 0, 0)
    return draw.textbbox((0, 0), text, font=font)


def text_width(draw, text, font):
    bbox = text_bbox(draw, text, font)
    return bbox[2] - bbox[0]


def split_lines(draw, text, font, max_width):
    raw_lines = str(text or "").split("\n")
    if not max_width:
      return raw_lines

    wrapped = []
    for raw in raw_lines:
        if not raw:
            wrapped.append("")
            continue
        current = ""
        for char in raw:
            candidate = f"{current}{char}"
            if not current or text_width(draw, candidate, font) <= max_width:
                current = candidate
                continue
            wrapped.append(current)
            current = char
        if current:
            wrapped.append(current)
    return wrapped


def render_overlay(draw, payload):
    font_size = int(payload.get("fontSize", 14))
    line_height = int(payload.get("lineHeight", math.ceil(font_size * 1.4)))
    max_width = payload.get("maxWidth")
    max_width = int(max_width) if max_width else None
    max_lines = int(payload.get("maxLines", 99))
    align = payload.get("align", "left")
    padding_x = int(payload.get("paddingX", 0))
    padding_y = int(payload.get("paddingY", 0))
    font_path = payload["fontPath"]
    text = str(payload.get("text", ""))

    font = ImageFont.truetype(font_path, font_size)
    lines = split_lines(draw, text, font, max_width)
    lines = lines[:max_lines] if max_lines > 0 else lines
    widest = 0
    top_adjust = 0
    bottom_adjust = 0
    for line in lines or [""]:
        bbox = text_bbox(draw, line, font)
        widest = max(widest, bbox[2] - bbox[0])
        top_adjust = min(top_adjust, bbox[1])
        bottom_adjust = max(bottom_adjust, bbox[3])

    image_width = (max_width or widest or font_size) + padding_x * 2
    image_height = max(
        line_height * max(len(lines), 1) + padding_y * 2,
        (bottom_adjust - top_adjust) + padding_y * 2,
    )

    image = Image.new("RGBA", (image_width, image_height), (255, 255, 255, 0))
    image_draw = ImageDraw.Draw(image)

    for index, line in enumerate(lines or [""]):
        bbox = text_bbox(image_draw, line, font)
        line_width = bbox[2] - bbox[0]
        baseline_y = padding_y + index * line_height - bbox[1]

        if align == "center":
            x = padding_x + ((image_width - padding_x * 2 - line_width) / 2)
        elif align == "right":
            x = image_width - padding_x - line_width
        else:
            x = padding_x

        image_draw.text((x, baseline_y), line, font=font, fill=(0, 0, 0, 255))

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return {
        "id": payload["id"],
        "width": image_width,
        "height": image_height,
        "pngBase64": base64.b64encode(buffer.getvalue()).decode("ascii"),
    }


def main():
    payload = json.load(sys.stdin)
    canvas = ImageDraw.Draw(Image.new("RGBA", (1, 1), (255, 255, 255, 0)))
    items = [render_overlay(canvas, overlay) for overlay in payload["overlays"]]
    json.dump({"items": items}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
