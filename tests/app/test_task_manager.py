"""
Unit tests for app/task_manager.py

Покривають:
- TaskManager: create, get, update, contains, cancel, pause, resume,
               is_paused, is_cancelled, create_extraction_task, create_annotate_task
- AnnotatedFileStore: put, get, pop, contains, _cleanup (TTL-видалення),
                      shutdown
"""

import queue
import time

import pytest

from app.task_manager import AnnotatedFileStore, TaskManager


# ---------------------------------------------------------------------------
# TaskManager
# ---------------------------------------------------------------------------

class TestTaskManager:
    def test_create_and_get(self):
        tm = TaskManager()
        tm.create("t1", {"status": "running"})
        assert tm.get("t1") == {"status": "running"}

    def test_get_nonexistent_returns_none(self):
        tm = TaskManager()
        assert tm.get("unknown") is None

    def test_contains_true(self):
        tm = TaskManager()
        tm.create("t1", {})
        assert tm.contains("t1") is True

    def test_contains_false(self):
        tm = TaskManager()
        assert tm.contains("t1") is False

    def test_update_existing_key(self):
        tm = TaskManager()
        tm.create("t1", {"status": "idle"})
        result = tm.update("t1", "status", "running")
        assert result is True
        info = tm.get("t1")
        assert info is not None and info["status"] == "running"

    def test_update_nonexistent_returns_false(self):
        tm = TaskManager()
        assert tm.update("ghost", "key", "val") is False

    # --- cancel ---

    def test_cancel_sets_cancelled_flag(self):
        tm = TaskManager()
        tm.create_extraction_task("t1")
        assert tm.cancel("t1") is True
        assert tm.is_cancelled("t1") is True

    def test_cancel_clears_paused_flag(self):
        tm = TaskManager()
        tm.create_extraction_task("t1")
        tm.pause("t1")
        tm.cancel("t1")
        assert tm.is_paused("t1") is False

    def test_cancel_nonexistent_returns_false(self):
        tm = TaskManager()
        assert tm.cancel("nobody") is False

    # --- pause / resume ---

    def test_pause_sets_flag(self):
        tm = TaskManager()
        tm.create_extraction_task("t1")
        tm.pause("t1")
        assert tm.is_paused("t1") is True

    def test_resume_clears_flag(self):
        tm = TaskManager()
        tm.create_extraction_task("t1")
        tm.pause("t1")
        tm.resume("t1")
        assert tm.is_paused("t1") is False

    def test_is_paused_nonexistent_returns_false(self):
        tm = TaskManager()
        assert tm.is_paused("ghost") is False

    def test_is_cancelled_nonexistent_returns_false(self):
        tm = TaskManager()
        assert tm.is_cancelled("ghost") is False

    # --- create_extraction_task ---

    def test_create_extraction_task_returns_queue(self):
        tm = TaskManager()
        q = tm.create_extraction_task("t1")
        assert isinstance(q, queue.Queue)

    def test_create_extraction_task_registers_task(self):
        tm = TaskManager()
        tm.create_extraction_task("t1")
        assert tm.contains("t1")

    def test_create_extraction_task_status_running(self):
        tm = TaskManager()
        tm.create_extraction_task("t1")
        info = tm.get("t1")
        assert info is not None and info["status"] == "running"

    # --- create_annotate_task ---

    def test_create_annotate_task_returns_queue(self):
        tm = TaskManager()
        q = tm.create_annotate_task("t2")
        assert isinstance(q, queue.Queue)

    def test_create_annotate_task_status_processing(self):
        tm = TaskManager()
        tm.create_annotate_task("t2")
        info = tm.get("t2")
        assert info is not None and info["status"] == "processing"

    # --- thread safety (basic smoke test) ---

    def test_concurrent_creates(self):
        import threading
        tm = TaskManager()
        errors = []

        def worker(task_id):
            try:
                tm.create(task_id, {"v": task_id})
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(f"task-{i}",)) for i in range(50)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert errors == []
        assert all(tm.contains(f"task-{i}") for i in range(50))


# ---------------------------------------------------------------------------
# AnnotatedFileStore
# ---------------------------------------------------------------------------

class TestAnnotatedFileStore:
    def _make_store(self, ttl=3600) -> AnnotatedFileStore:
        """Зупиняє автоматичне очищення, щоб уникнути race conditions у тестах."""
        return AnnotatedFileStore(ttl_seconds=ttl, cleanup_interval_seconds=999_999)

    def test_put_and_get(self, tmp_path):
        store = self._make_store()
        p = tmp_path / "f.pdf"
        p.write_bytes(b"pdf")
        store.put("f1", str(p), "f.pdf")
        info = store.get("f1")
        assert info is not None
        assert info["filename"] == "f.pdf"
        assert info["path"] == str(p)
        store.shutdown()

    def test_get_nonexistent_returns_none(self):
        store = self._make_store()
        assert store.get("ghost") is None
        store.shutdown()

    def test_contains_true(self, tmp_path):
        store = self._make_store()
        p = tmp_path / "f.pdf"
        p.write_bytes(b"pdf")
        store.put("f1", str(p), "f.pdf")
        assert store.contains("f1") is True
        store.shutdown()

    def test_contains_false(self):
        store = self._make_store()
        assert store.contains("ghost") is False
        store.shutdown()

    def test_pop_removes_entry(self, tmp_path):
        store = self._make_store()
        p = tmp_path / "f.pdf"
        p.write_bytes(b"pdf")
        store.put("f1", str(p), "f.pdf")
        info = store.pop("f1")
        assert info is not None
        assert store.get("f1") is None
        store.shutdown()

    def test_pop_nonexistent_returns_none(self):
        store = self._make_store()
        assert store.pop("ghost") is None
        store.shutdown()

    def test_created_at_is_set(self, tmp_path):
        store = self._make_store()
        p = tmp_path / "f.pdf"
        p.write_bytes(b"pdf")
        before = time.time()
        store.put("f1", str(p), "f.pdf")
        after = time.time()
        info = store.get("f1")
        assert info is not None and before <= info["created_at"] <= after
        store.shutdown()

    def test_cleanup_removes_expired_file(self, tmp_path):
        store = self._make_store(ttl=0)
        p = tmp_path / "expired.pdf"
        p.write_bytes(b"pdf")
        store.put("f1", str(p), "expired.pdf")
        # Файл має бути на диску перед cleanup
        assert p.exists()
        time.sleep(0.05)
        with store._lock:
            store._cleanup()
        assert store.get("f1") is None
        assert not p.exists()
        store.shutdown()

    def test_cleanup_keeps_fresh_file(self, tmp_path):
        store = self._make_store(ttl=3600)
        p = tmp_path / "fresh.pdf"
        p.write_bytes(b"pdf")
        store.put("f1", str(p), "fresh.pdf")
        with store._lock:
            store._cleanup()
        assert store.get("f1") is not None
        assert p.exists()
        store.shutdown()

    def test_shutdown_stops_cleanup_thread(self):
        store = self._make_store()
        store.shutdown()
        assert not store._cleanup_thread.is_alive()
