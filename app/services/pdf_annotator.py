import logging
import os
import queue
import re
import tempfile
import time
import uuid

import fitz

logger = logging.getLogger(__name__)
_DOI_RE = re.compile("10\\.[^\\s?#]+")


def _build_robust_regex(text: str, is_doi: bool = False) -> str:
    escaped = [re.escape(c) for c in text]
    core_regex_str = "[\\s\\-]*".join(escaped)
    if is_doi:
        prefixes = [
            "https://doi.org/",
            "http://doi.org/",
            "https://dx.doi.org/",
            "http://dx.doi.org/",
            "doi.org/",
            "doi:",
            "doi",
        ]
        mapped = ["[\\s\\-]*".join(re.escape(c) for c in p) for p in prefixes]
        prefix_regex_str = "(?:(?:" + ")|(?:".join(mapped) + "))?[\\s\\-]*"
        return prefix_regex_str + core_regex_str
    return core_regex_str


def _get_regex_match_groups(page, regex_pattern: str) -> list[list]:
    page_dict = page.get_text("rawdict")
    chars = [
        c
        for block in page_dict.get("blocks", [])
        if "lines" in block
        for line in block["lines"]
        for span in line["spans"]
        for c in span.get("chars", [])
    ]
    if not chars:
        return []
    full_text = "".join(c["c"] for c in chars)
    match_groups = []
    for match in re.finditer(regex_pattern, full_text, re.IGNORECASE):
        rects = [fitz.Rect(chars[i]["bbox"]) for i in range(match.start(), min(match.end(), len(chars)))]
        if rects:
            match_groups.append(rects)
    return match_groups


def _build_citation_regex(text: str) -> str:
    doi_match = _DOI_RE.search(text)
    if doi_match:
        return _build_robust_regex(doi_match.group(0), True)
    if text.startswith("http"):
        clean = re.sub("^https?://(www\\.)?", "", text).split("?")[0].rstrip("/")
        return _build_robust_regex(clean, False)
    clean = re.sub("^[a-zA-Z]+:\\s*", "", text)
    return _build_robust_regex(clean, False)


def _draw_page_badges(page, badges: list[dict]) -> None:
    lines: list[list[dict]] = []
    for b in badges:
        placed = False
        for line in lines:
            if abs(line[0]["y0"] - b["y0"]) < 8:
                line.append(b)
                placed = True
                break
        if not placed:
            lines.append([b])
    for line_badges in lines:
        drawn_badges: list[dict] = []
        for b in line_badges:
            display_text = b["title"] if b["count"] == 1 else f"{b['title']} ({b['count']})"
            width = fitz.get_text_length(display_text, fontname="helv", fontsize=5)
            height = 8
            is_right = b["is_right"]
            if any(db["is_right"] == is_right for db in drawn_badges):
                is_right = not is_right
            existing_on_actual = [db for db in drawn_badges if db["is_right"] == is_right]
            if is_right:
                margin_x = page.rect.width - width - 10
                for eb in existing_on_actual:
                    margin_x -= eb["width"] + 4
            else:
                margin_x = 10
                for eb in existing_on_actual:
                    margin_x += eb["width"] + 4
            tag_rect = fitz.Rect(margin_x, b["y0"] + 1, margin_x + width + 4, b["y0"] + 1 + height)
            try:
                page.draw_rect(tag_rect, color=b["color"], fill=b["color"], fill_opacity=0.15, stroke_opacity=0.3)
                page.insert_text(
                    fitz.Point(tag_rect.x0 + 2, tag_rect.y0 + 6),
                    display_text,
                    fontsize=5,
                    fontname="helv",
                    color=(0, 0, 0),
                )
                drawn_badges.append({"is_right": is_right, "width": width + 4})
            except Exception:
                logger.error("Failed to draw a margin badge during annotation.")


def remove_file(path: str) -> None:
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        logger.error("Failed to delete a temporary file.")


def start_annotate_task(
    task_id: str,
    q: queue.Queue,
    pdf_path: str,
    citations_data: list,
    original_filename: str,
    task_manager,
    annotated_file_store,
) -> None:
    def run_task():
        doc = None
        try:
            doc = fitz.open(pdf_path)
            DEFAULT_COLOR = (1.0, 0.9, 0.2)
            total = len(citations_data)
            page_badges: dict[int, list] = {int(page.number): [] for page in doc if page.number is not None}
            for idx, cit_obj in enumerate(citations_data):
                while task_manager.is_paused(task_id):
                    if task_manager.is_cancelled(task_id):
                        break
                    time.sleep(0.5)
                if task_manager.is_cancelled(task_id):
                    q.put({"type": "error", "message": "Cancelled by user"})
                    return
                q.put({"type": "progress", "current": idx + 1, "total": total})
                text = cit_obj.get("text") or cit_obj.get("citation") or ""
                url = cit_obj.get("url") or ""
                if not url:
                    if text.startswith("http"):
                        url = text
                    elif text.startswith("10.") or "doi.org" in text:
                        url = "https://doi.org/" + re.sub("^doi:", "", text, flags=re.IGNORECASE)
                color = cit_obj.get("color", DEFAULT_COLOR)
                title = cit_obj.get("title", "")
                if not text:
                    continue
                regex = _build_citation_regex(text)
                for page in doc:
                    if page.number is None:
                        continue
                    page_num = int(page.number)
                    match_groups = _get_regex_match_groups(page, regex)
                    for match_rects in match_groups:
                        merged_rects: list[fitz.Rect] = []
                        for rect in match_rects:
                            merged = False
                            for i, m_rect in enumerate(merged_rects):
                                if abs(rect.y0 - m_rect.y0) < 6:
                                    expanded = fitz.Rect(m_rect.x0 - 4, m_rect.y0 - 2, m_rect.x1 + 4, m_rect.y1 + 2)
                                    if rect.intersects(expanded):
                                        merged_rects[i] = m_rect | rect
                                        merged = True
                                        break
                            if not merged:
                                merged_rects.append(rect)
                        merged_rects.sort(key=lambda r: r.y0)
                        for idx_rect, rect in enumerate(merged_rects):
                            annot = page.add_highlight_annot(rect)
                            if isinstance(color, list) and len(color) == 3:
                                c_tuple = tuple(color)
                                annot.set_colors(stroke=c_tuple)
                            else:
                                c_tuple = DEFAULT_COLOR
                                annot.set_colors(stroke=DEFAULT_COLOR)
                            annot.set_opacity(0.4)
                            if title and idx_rect == 0:
                                title_short = title.replace(" Dataset", "")
                                badges_on_line = [
                                    b for b in page_badges.get(page_num, []) if abs(b["y0"] - rect.y0) < 8
                                ]
                                existing = next((b for b in badges_on_line if b["title"] == title_short), None)
                                if existing:
                                    existing["count"] += 1
                                else:
                                    if page_num not in page_badges:
                                        page_badges[page_num] = []
                                    page_badges[page_num].append(
                                        {
                                            "y0": rect.y0,
                                            "title": title_short,
                                            "count": 1,
                                            "color": c_tuple,
                                            "is_right": rect.x0 > page.rect.width / 2,
                                        }
                                    )
                            annot.update()
                            if url and url.startswith("http"):
                                page.insert_link({"kind": fitz.LINK_URI, "from": rect, "uri": url})
            for page in doc:
                if page.number is None:
                    continue
                badges = page_badges.get(int(page.number), [])
                if badges:
                    _draw_page_badges(page, badges)
            fd_out, out_path = tempfile.mkstemp(suffix=".pdf")
            os.close(fd_out)
            import json

            meta = doc.metadata or {}
            meta["subject"] = json.dumps({"citations": citations_data})
            doc.set_metadata(meta)
            doc.save(out_path)
            doc.close()
            doc = None
            file_id = str(uuid.uuid4())
            annotated_file_store.put(file_id, out_path, f"annotated_{original_filename}")
            q.put({"type": "complete", "result": {"file_id": file_id}})
        except Exception as exc:
            logger.error("Annotation task failed.")
            q.put({"type": "error", "message": str(exc)})
        finally:
            if doc:
                try:
                    doc.close()
                except Exception:
                    pass
            remove_file(pdf_path)

    task_manager.submit_task(run_task)
