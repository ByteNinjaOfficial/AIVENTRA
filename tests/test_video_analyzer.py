"""Tests for aiventra.core.video_analyzer — Track B (CCTV frame extraction & VLM)."""

import io
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import numpy as np
from PIL import Image

import cv2

from aiventra.core.schemas import DetectedObject, VideoEvent, VideoAnalysisResult
from aiventra.core.video_analyzer import (
    _split_batches,
    classify_events,
    detect_motion_frames,
    sample_frames,
)


class TestSplitBatches:
    def test_empty(self):
        assert _split_batches([], 3) == [[]]

    def test_splits_correctly(self):
        assert _split_batches([1, 2, 3], 3) == [[1], [2], [3]]

    def test_multiple_batches(self):
        items = list(range(10))
        batches = _split_batches(items, 3)
        total = sum(len(b) for b in batches)
        assert total == 10
        assert len(batches) <= 3


class TestSampleFrames:
    @patch("aiventra.core.video_analyzer.cv2.VideoCapture")
    def test_opens_file(self, mock_cap_class):
        cap = MagicMock()
        cap.isOpened.return_value = True
        cap.get = MagicMock(side_effect=lambda prop: {
            cv2.CAP_PROP_FPS: 30.0,
            cv2.CAP_PROP_FRAME_COUNT: 60,
        }.get(prop, 0))
        cap.set.return_value = True

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        cap.read.return_value = (True, frame)
        mock_cap_class.return_value = cap

        frames = sample_frames("dummy.mp4", sample_fps=1)
        assert len(frames) == 2
        cap.release.assert_called()

    @patch("aiventra.core.video_analyzer.cv2.VideoCapture")
    def test_cannot_open(self, mock_cap_class):
        cap = MagicMock()
        cap.isOpened.return_value = False
        mock_cap_class.return_value = cap
        with pytest.raises(RuntimeError):
            sample_frames("nonexistent.mp4")


class TestDetectMotionFrames:
    def test_empty(self):
        assert detect_motion_frames([]) == []

    def test_no_motion(self):
        frames = [(np.zeros((100, 100, 3), dtype=np.uint8), 0.0, 0)]
        result = detect_motion_frames(frames, foreground_threshold=50000)
        assert result == []

    def test_detects_motion(self):
        frames = [
            (np.zeros((200, 200, 3), dtype=np.uint8), 0.0, 0),
            (np.ones((200, 200, 3), dtype=np.uint8) * 255, 1.0, 1),
        ]
        result = detect_motion_frames(frames, foreground_threshold=10)
        assert len(result) > 0


class TestClassifyEvents:
    def test_blood(self):
        d = DetectedObject(class_name="blood", confidence=0.9)
        item = (0, np.zeros((100, 100, 3), dtype=np.uint8), 0.0, 0, [d])
        classified = classify_events([item])
        assert classified[0][5] == "blood_visible"

    def test_weapon(self):
        d = DetectedObject(class_name="knife", confidence=0.9)
        item = (0, np.zeros((100, 100, 3), dtype=np.uint8), 0.0, 0, [d])
        classified = classify_events([item])
        assert classified[0][5] == "weapon_visible"

    def test_person_present(self):
        d = DetectedObject(class_name="person", confidence=0.9)
        item = (0, np.zeros((100, 100, 3), dtype=np.uint8), 0.0, 0, [d])
        classified = classify_events([item])
        assert classified[0][5] == "person_present"

    def test_empty_frame(self):
        item = (0, np.zeros((100, 100, 3), dtype=np.uint8), 0.0, 0, [])
        classified = classify_events([item])
        assert classified[0][5] == "empty_frame"

    def test_chair_only(self):
        d = DetectedObject(class_name="chair", confidence=0.9)
        item = (0, np.zeros((100, 100, 3), dtype=np.uint8), 0.0, 0, [d])
        classified = classify_events([item])
        assert classified[0][5] == "property_evidence"


class TestVideoEventSchema:
    def test_valid(self):
        d = DetectedObject(class_name="person", confidence=0.8)
        evt = VideoEvent(
            event_type="person_present",
            timestamp_seconds=12.5,
            frame_number=375,
            detected_objects=[d],
            event_description="A person walks through the frame.",
            confidence=0.75,
        )
        assert evt.advisory_note == "Advisory output only - not conclusive evidence."

    def test_video_analysis_result(self):
        result = VideoAnalysisResult(
            video_path="/tmp/clip.mp4",
            total_events=2,
            frames_sampled=30,
            motion_frames=5,
            yolo_relevant_frames=2,
            processing_time_seconds=15.0,
        )
        assert result.model_used is None


class TestAnalyzeFramesQwenBatched:
    def test_mock_call(self):
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[:] = (0, 128, 255)
        classified = [
            (0, frame, 5.0, 150, [], "person_present"),
        ]

        mock_resp = MagicMock()
        mock_msg = MagicMock()
        mock_msg.content = "Two individuals enter the building."
        mock_choice = MagicMock()
        mock_choice.message = mock_msg
        mock_resp.choices = [mock_choice]

        with patch("aiventra.core.video_analyzer.Config") as mock_config:
            mock_config.API_KEY = "sk-test"
            mock_config.API_BASE_URL = "https://fake"
            mock_config.validate.return_value = None
            with patch("openai.OpenAI") as mock_oa_class:
                mock_client = MagicMock()
                mock_client.chat.completions.create.return_value = mock_resp
                mock_oa_class.return_value = mock_client

                from aiventra.core.video_analyzer import analyze_frames_qwen_batched

                events = analyze_frames_qwen_batched(
                    classified, max_batch_size=2, model="test-model"
                )
                assert len(events) == 1
                assert "Two individuals" in events[0].event_description
                mock_client.chat.completions.create.assert_called_once()


class TestDetectObjectsBatch:
    def test_single_frame_routes_through_predictor(self):
        with patch("aiventra.core.video_analyzer._ULTRALYTICS_AVAILABLE", False):
            from aiventra.core.video_analyzer import detect_objects_batch

            frame = np.zeros((100, 100, 3), dtype=np.uint8)
            items = [(0, frame, 0.0, 0)]
            result = detect_objects_batch(items, workers=1)
            assert len(result) == 1
            assert result[0][4] == []
