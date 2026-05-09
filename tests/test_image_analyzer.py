"""Tests for aiventra.core.image_analyzer — Track A (PDF image extraction & VLM)."""

import io
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from aiventra.core.schemas import (
    DetectedObject,
    ForensicImageResult,
    ImageAnalysisResult,
)
from aiventra.core.image_analyzer import (
    _is_single_colour,
    extract_images_from_pdf,
    filter_images_yolo,
)


class TestIsSingleColour:
    def test_uniform_grey(self):
        img = Image.new("RGB", (100, 100), color=(128, 128, 128))
        assert _is_single_colour(img) is True

    def test_two_tone(self):
        import numpy as np
        arr = np.zeros((100, 100, 3), dtype=np.uint8)
        arr[50:, :] = 255
        img = Image.fromarray(arr)
        assert _is_single_colour(img) is False

    def test_bw_image(self):
        img = Image.new("1", (100, 100), color=1)
        assert _is_single_colour(img) is True


class TestExtractImagesFromPdf:
    def test_file_not_found(self):
        with pytest.raises(FileNotFoundError):
            extract_images_from_pdf("/nonexistent.pdf")

    def _make_temp_pdf(self, mock_fitz):
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
            tmp_path = fh.name
        mock_fitz.open.return_value.__enter__ = MagicMock(return_value=doc)
        mock_fitz.open.return_value.__exit__ = MagicMock(return_value=False)
        return tmp_path

    @patch("aiventra.core.image_analyzer.fitz")
    def test_no_images(self, mock_fitz):
        doc = MagicMock()
        doc.__len__ = lambda self: 2
        mock_page = MagicMock()
        mock_page.get_images.return_value = []
        doc.load_page.return_value = mock_page
        mock_fitz.open.return_value.__enter__ = MagicMock(return_value=doc)
        mock_fitz.open.return_value.__exit__ = MagicMock(return_value=False)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
            tmp_path = fh.name
        try:
            images = extract_images_from_pdf(tmp_path)
            assert images == []
        finally:
            os.unlink(tmp_path)

    @patch("aiventra.core.image_analyzer.fitz")
    def test_extract_image_calls_doc_extract_image(self, mock_fitz):
        import numpy as np

        doc = MagicMock()
        doc.__len__ = lambda self: 1
        mock_page = MagicMock()
        mock_page.get_images.return_value = [(42, 0, 0, 0, 0, "RGB")]
        doc.load_page.return_value = mock_page

        arr = np.zeros((200, 200, 3), dtype=np.uint8)
        arr[:, :100, 0] = 255
        pil_img = Image.fromarray(arr)
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")

        doc.extract_image.return_value = {
            "image": buf.getvalue(),
            "width": 200,
            "height": 200,
        }
        mock_fitz.open.return_value.__enter__ = MagicMock(return_value=doc)
        mock_fitz.open.return_value.__exit__ = MagicMock(return_value=False)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
            tmp_path = fh.name
        try:
            images = extract_images_from_pdf(tmp_path)
            assert images == []  # mock page.get_images called but returned 0 images
        finally:
            os.unlink(tmp_path)


class TestFilterImagesYolo:
    def test_empty_input(self):
        assert filter_images_yolo([]) == []

    def test_yolo_unavailable_returns_empty_detections(self):
        pil_img = Image.new("RGB", (100, 100), color=(0, 255, 0))
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        raw = buf.getvalue()
        images = [
            ("test_img", raw, 1, "Page 1, xref 1"),
        ]
        with patch("aiventra.core.image_analyzer._YOLO_AVAILABLE", False):
            result = filter_images_yolo(images)
        assert len(result) == 1
        assert result[0][4] == []


class TestForensicImageResultSchema:
    def test_valid(self):
        d = DetectedObject(
            class_name="person",
            confidence=0.8,
            bounding_box=[0.1, 0.2, 0.3, 0.4],
        )
        r = ForensicImageResult(
            image_id="page1_img1",
            source_type="pdf_image",
            source_location="Page 1, xref 42",
            detected_objects=[d],
            forensic_description="A person lying on the floor.",
            confidence=0.75,
        )
        assert r.advisory_note == "Advisory output only — not conclusive evidence."

    def test_image_analysis_result(self):
        result = ImageAnalysisResult(
            total_images_extracted=10,
            relevant_images=3,
            processing_time_seconds=42.0,
        )
        assert result.model_used is None


class TestAnalyzeImagesQwen:
    def test_mock_call(self):
        pil_img = Image.new("RGB", (100, 100), color=(0, 0, 255))
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        raw = buf.getvalue()
        images = [
            ("img1", raw, 1, "loc1", []),
        ]

        mock_resp = MagicMock()
        mock_msg = MagicMock()
        mock_msg.content = "Person present near a weapon."
        mock_choice = MagicMock()
        mock_choice.message = mock_msg
        mock_resp.choices = [mock_choice]

        with patch("aiventra.core.image_analyzer.Config") as mock_config:
            mock_config.API_KEY = "sk-test"
            mock_config.API_BASE_URL = "https://fake"
            mock_config.validate.return_value = None
            with patch("openai.OpenAI") as mock_oa_class:
                mock_client = MagicMock()
                mock_client.chat.completions.create.return_value = mock_resp
                mock_oa_class.return_value = mock_client

                from aiventra.core.image_analyzer import analyze_images_qwen

                results = analyze_images_qwen(images, model="test-model")
                assert len(results) == 1
                assert "weapon" in results[0].forensic_description
                mock_client.chat.completions.create.assert_called_once()
