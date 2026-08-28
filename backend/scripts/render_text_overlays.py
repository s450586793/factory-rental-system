#!/usr/bin/env python3

import base64
import io
import json
import math
import re
import sys
from PIL import Image, ImageDraw, ImageFont


STANDARD_LEASE_HEADING_PATTERN = re.compile(r"^[一二三四五六七八九十百]+、")
STANDARD_LEASE_CLAUSE_PATTERN = re.compile(r"^\d+\.\s")
STANDARD_LEASE_HEADING_FONT_SIZE = 12
STANDARD_LEASE_HEADING_LINE_HEIGHT = 18
STANDARD_LEASE_CLAUSE_INDENT = 14


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


def line_width(draw, line, font, tab_stops):
    if not tab_stops or "\t" not in line:
        return text_width(draw, line, font)

    x = 0
    segments = line.split("\t")
    for index, segment in enumerate(segments):
        x += text_width(draw, segment, font)
        if index >= len(segments) - 1:
            continue
        next_stop = next((stop for stop in tab_stops if stop > x), None)
        x = next_stop if next_stop is not None else x + text_width(draw, "\t", font)
    return x


def draw_line_with_tabs(draw, xy, line, font, fill, tab_stops, scale):
    x, y = xy
    if not tab_stops or "\t" not in line:
        draw.text((x * scale, y * scale), line, font=font, fill=fill)
        return

    cursor = x
    for index, segment in enumerate(line.split("\t")):
        if segment:
            draw.text((cursor * scale, y * scale), segment, font=font, fill=fill)
            cursor += text_width(draw, segment, font) / scale
        if index >= line.count("\t"):
            continue
        next_stop = next((stop for stop in tab_stops if stop > cursor - x), None)
        if next_stop is None:
            cursor += text_width(draw, "\t", font) / scale
        else:
            cursor = x + next_stop


def build_render_lines(
    draw,
    text,
    font_path,
    font_index,
    font_size,
    line_height,
    max_width,
    paragraph_style,
):
    fonts = {}

    def get_font(size):
        if size not in fonts:
            fonts[size] = ImageFont.truetype(font_path, size, index=font_index)
        return fonts[size]

    if paragraph_style != "standardLeaseBody":
        font = get_font(font_size)
        return [
            {
                "text": line,
                "font": font,
                "fontSize": font_size,
                "lineHeight": line_height,
                "indent": 0,
            }
            for line in split_lines(draw, text, font, max_width)
        ]

    render_lines = []
    for raw_line in str(text or "").split("\n"):
        is_heading = bool(STANDARD_LEASE_HEADING_PATTERN.match(raw_line))
        is_clause = bool(STANDARD_LEASE_CLAUSE_PATTERN.match(raw_line))
        current_font_size = (
            STANDARD_LEASE_HEADING_FONT_SIZE if is_heading else font_size
        )
        current_line_height = (
            STANDARD_LEASE_HEADING_LINE_HEIGHT if is_heading else line_height
        )
        indent = STANDARD_LEASE_CLAUSE_INDENT if is_clause else 0
        current_font = get_font(current_font_size)
        available_width = max_width - indent if max_width else None

        for line in split_lines(draw, raw_line, current_font, available_width):
            render_lines.append(
                {
                    "text": line,
                    "font": current_font,
                    "fontSize": current_font_size,
                    "lineHeight": current_line_height,
                    "indent": indent,
                }
            )

    return render_lines


def render_overlay(draw, payload):
    font_size = int(payload.get("fontSize", 14))
    line_height = int(payload.get("lineHeight", math.ceil(font_size * 1.4)))
    max_width = payload.get("maxWidth")
    max_width = int(max_width) if max_width else None
    max_lines = int(payload.get("maxLines", 99))
    align = payload.get("align", "left")
    tab_stops = [int(stop) for stop in payload.get("tabStops", [])]
    padding_x = int(payload.get("paddingX", 0))
    padding_y = int(payload.get("paddingY", 0))
    font_index = int(payload.get("fontIndex", 0))
    raster_scale = int(payload.get("rasterScale", 4))
    font_path = payload["fontPath"]
    text = str(payload.get("text", ""))
    paragraph_style = payload.get("paragraphStyle")

    render_lines = build_render_lines(
        draw,
        text,
        font_path,
        font_index,
        font_size,
        line_height,
        max_width,
        paragraph_style,
    )
    render_lines = render_lines[:max_lines] if max_lines > 0 else render_lines
    widest = 0
    top_adjust = 0
    bottom_adjust = 0
    for item in render_lines:
        line = item["text"]
        font = item["font"]
        bbox = text_bbox(draw, line, font)
        widest = max(
            widest,
            item["indent"] + line_width(draw, line, font, tab_stops),
        )
        top_adjust = min(top_adjust, bbox[1])
        bottom_adjust = max(bottom_adjust, bbox[3])

    display_width = (max_width or widest or font_size) + padding_x * 2
    display_height = max(
        sum(item["lineHeight"] for item in render_lines) + padding_y * 2,
        (bottom_adjust - top_adjust) + padding_y * 2,
        line_height + padding_y * 2,
    )
    image_width = display_width * raster_scale
    image_height = display_height * raster_scale

    image = Image.new("RGBA", (image_width, image_height), (255, 255, 255, 0))
    image_draw = ImageDraw.Draw(image)
    image_fonts = {}
    cursor_y = padding_y

    for item in render_lines:
        line = item["text"]
        font = item["font"]
        current_font_size = item["fontSize"]
        if current_font_size not in image_fonts:
            image_fonts[current_font_size] = ImageFont.truetype(
                font_path,
                current_font_size * raster_scale,
                index=font_index,
            )
        image_font = image_fonts[current_font_size]
        bbox = text_bbox(image_draw, line, font)
        measured_line_width = line_width(image_draw, line, font, tab_stops)
        baseline_y = cursor_y - bbox[1]
        indent = item["indent"]
        available_width = (max_width or widest) - indent

        if align == "center":
            x = padding_x + indent + ((available_width - measured_line_width) / 2)
        elif align == "right":
            x = padding_x + indent + available_width - measured_line_width
        else:
            x = padding_x + indent

        draw_line_with_tabs(
            image_draw,
            (x, baseline_y),
            line,
            image_font,
            (0, 0, 0, 255),
            tab_stops,
            raster_scale,
        )
        cursor_y += item["lineHeight"]

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return {
        "id": payload["id"],
        "width": display_width,
        "height": display_height,
        "pixelWidth": image_width,
        "pixelHeight": image_height,
        "pngBase64": base64.b64encode(buffer.getvalue()).decode("ascii"),
    }


def main():
    payload = json.load(sys.stdin)
    canvas = ImageDraw.Draw(Image.new("RGBA", (1, 1), (255, 255, 255, 0)))
    items = [render_overlay(canvas, overlay) for overlay in payload["overlays"]]
    json.dump({"items": items}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
