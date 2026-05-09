"""Tests for aiventra.core.image_analyzer — Track A (PDF image extraction & VLM)."""

import io
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from aiventra.core.schemas import ForensicImageResult, ImageAnalysisResult
from aiventra.core.image_analyzer import (
    _is_single_colour,
    _image_to_base64,
    extract_images_from_pdf,
    analyze_images_qwen,
    analyze_pdf_images,
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


class TestImageToBase64:
    def test_rgb_jpeg(self):
        img = Image.new("RGB", (50, 50), color=(255, 0, 0))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        b64 = _image_to_base64(buf.getvalue())
        import base64
        decoded = base64.b64decode(b64)
        assert decoded[:2] == b"\xff\xd8"  # JPEG magic bytes


class TestExtractImagesFromPdf:
    def test_file_not_found(self):
        with pytest.raises(FileNotFoundError):
            extract_images_from_pdf("/nonexistent.pdf")


class TestForensicImageResultSchema:
    def test_valid(self):
        r = ForensicImageResult(
            image_id="page1_img1",
            source_type="pdf_image",
            source_location="Page 1, xref 42",
            forensic_description="A person lying on the floor.",
            confidence=0.75,
        )
        assert r.advisory_note == "Advisory output only - not conclusive evidence."

    def test_image_analysis_result(self):
        result = ImageAnalysisResult(
            total_images_extracted=10,
            images_analyzed=12,
            vlm_batch_size=2,
            processing_time_seconds=42.0,
        )
        assert result.model_used is None
        assert result.images_analyzed == 12
        assert result.vlm_batch_size == 2


class TestAnalyzeImagesQwen:
    def test_mock_call(self):
        pil_img = Image.new("RGB", (100, 100), color=(0, 0, 255))
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        raw = buf.getvalue()
        images = [
            ("img1", raw, 1, "loc1"),
            ("img2", raw, 2, "loc2"),
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

                results = analyze_images_qwen(images, model="test-model")
                assert len(results) == 2
                assert "weapon" in results[0].forensic_description
                assert "weapon" in results[1].forensic_description
                assert results[0].image_id == "img1"
                assert results[1].image_id == "img2"
                assert results[0].source_type == "pdf_image"
                mock_client.chat.completions.create.assert_called_once()

    def test_empty_input(self):
        results = analyze_images_qwen([])
        assert results == []

    def test_single_image(self):
        pil_img = Image.new("RGB", (100, 100), color=(0, 255, 0))
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        raw = buf.getvalue()
        images = [("single_img", raw, 1, "loc1")]

        mock_resp = MagicMock()
        mock_msg = MagicMock()
        mock_msg.content = "A single forensic image."
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

                results = analyze_images_qwen(images)
                assert len(results) == 1
                assert results[0].forensic_description == "A single forensic image."
                assert results[0].confidence == 0.65  # batch_index=0

    def test_batch_index_confidence_rises(self):
        pil_img = Image.new("RGB", (100, 100), color=(0, 255, 0))
        buf = io.BytesIO()
        pil_img.save(buf, format="PNG")
        raw = buf.getvalue()

        mock_resp = MagicMock()
        mock_msg = MagicMock()
        mock_msg.content = "Batch description."
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

                images = [(f"img{i}", raw, i, f"loc{i}") for i in range(4)]
                results = analyze_images_qwen(images, max_batch_size=2)
                assert len(results) == 4
                assert results[0].confidence < results[3].confidence


class TestAnalyzePdfImages:
    def test_empty_pdf_no_crash(self):
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as fh:
            tmp_path = fh.name
        try:
            with patch("aiventra.core.image_analyzer.fitz.open") as mock_fitz:
                doc = MagicMock()
                doc.__len__ = lambda self: 0
                doc.load_page.return_value = MagicMock(get_images=MagicMock(return_value=[]))
                mock_fitz.open.return_value.__enter__ = MagicMock(return_value=doc)
                mock_fitz.open.return_value.__exit__ = MagicMock(return_value=False)
                with patch("aiventra.core.image_analyzer.Config") as mock_config:
                    mock_config.API_KEY = "sk-test"
                    mock_config.API_BASE_URL = "https://fake"
                    mock_config.validate.return_value = None
                    with patch("openai.OpenAI") as mock_oa_class:
                        mock_client = MagicMock()
                        mock_client.chat.completions.create.return_value = MagicMock(
                            choices=[MagicMock(message=MagicMock(content=""))]
                        )
                        mock_oa_class.return_value = mock_client
                        result = analyze_pdf_images(tmp_path)
                        assert result.total_images_extracted == 0
        finally:
            os.unlink(tmp_path)
