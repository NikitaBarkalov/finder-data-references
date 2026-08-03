import logging
import os
import queue
import threading
import time
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


class TaskManager:
    def __init__(self, max_workers: int = 3, ttl_seconds: int = 3600, cleanup_interval_seconds: int = 300):
        self._lock = threading.Lock()
        self._tasks: dict[str, dict] = {}
        self.executor = ThreadPoolExecutor(max_workers=max_workers)

        self._ttl = ttl_seconds
        self._cleanup_interval = cleanup_interval_seconds
        self._stop_cleanup = threading.Event()
        self._cleanup_thread = threading.Thread(target=self._periodic_cleanup, daemon=True)
        self._cleanup_thread.start()

    def _periodic_cleanup(self):
        while not self._stop_cleanup.wait(self._cleanup_interval):
            now = time.time()
            with self._lock:
                expired = []
                for tid, info in self._tasks.items():
                    status = info.get("status")
                    if status in ["complete", "error", "cancelled"]:
                        updated_at = info.get("updated_at", info.get("created_at", now))
                        if updated_at is None:
                            updated_at = now
                        if now - float(updated_at) > self._ttl:
                            expired.append(tid)
                for tid in expired:
                    self._tasks.pop(tid, None)

    def shutdown(self):
        self._stop_cleanup.set()
        self._cleanup_thread.join(timeout=5)
        self.executor.shutdown(wait=False)

    def create(self, task_id: str, data: dict) -> None:
        with self._lock:
            data["created_at"] = time.time()
            data["updated_at"] = time.time()
            self._tasks[task_id] = data

    def get(self, task_id: str) -> dict | None:
        with self._lock:
            return self._tasks.get(task_id)

    def update(self, task_id: str, key: str, value) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False
            self._tasks[task_id][key] = value
            self._tasks[task_id]["updated_at"] = time.time()
            return True

    def submit_task(self, func, *args, **kwargs):
        self.executor.submit(func, *args, **kwargs)

    def contains(self, task_id: str) -> bool:
        with self._lock:
            return task_id in self._tasks

    def create_extraction_task(self, task_id: str) -> queue.Queue:
        q: queue.Queue = queue.Queue()
        self.create(task_id, {"queue": q, "status": "running"})
        return q

    def create_annotate_task(self, task_id: str) -> queue.Queue:
        q: queue.Queue = queue.Queue()
        self.create(task_id, {"status": "processing", "queue": q})
        return q

    def is_paused(self, task_id: str) -> bool:
        task = self.get(task_id)
        return bool(task and task.get("paused"))

    def is_cancelled(self, task_id: str) -> bool:
        task = self.get(task_id)
        return bool(task and task.get("cancelled"))

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False
            self._tasks[task_id]["cancelled"] = True
            self._tasks[task_id]["paused"] = False
            self._tasks[task_id]["status"] = "cancelled"
            self._tasks[task_id]["updated_at"] = time.time()
            return True

    def pause(self, task_id: str) -> bool:
        return self.update(task_id, "paused", True)

    def resume(self, task_id: str) -> bool:
        return self.update(task_id, "paused", False)


class AnnotatedFileStore:
    def __init__(self, ttl_seconds: int = 3600, cleanup_interval_seconds: int = 300):
        self._lock = threading.Lock()
        self._files: dict[str, dict] = {}
        self._ttl = ttl_seconds
        self._cleanup_interval = cleanup_interval_seconds
        self._stop_cleanup = threading.Event()
        self._cleanup_thread = threading.Thread(target=self._periodic_cleanup, daemon=True)
        self._cleanup_thread.start()

    def _cleanup(self) -> None:
        now = time.time()
        expired = []
        for fid, info in self._files.items():
            created_at = info.get("created_at", now)
            if created_at is None:
                created_at = now
            if now - float(created_at) > self._ttl:
                expired.append(fid)
        for fid in expired:
            info = self._files.pop(fid, None)
            if info and os.path.exists(info["path"]):
                try:
                    os.remove(info["path"])
                except Exception:
                    logger.error("Failed to delete an expired annotated file.")

    def _periodic_cleanup(self) -> None:
        while not self._stop_cleanup.wait(self._cleanup_interval):
            with self._lock:
                self._cleanup()

    def shutdown(self) -> None:
        self._stop_cleanup.set()
        self._cleanup_thread.join(timeout=5)

    def put(self, file_id: str, path: str, filename: str) -> None:
        with self._lock:
            self._files[file_id] = {"path": path, "filename": filename, "created_at": time.time()}

    def get(self, file_id: str) -> dict | None:
        with self._lock:
            return self._files.get(file_id)

    def pop(self, file_id: str) -> dict | None:
        with self._lock:
            return self._files.pop(file_id, None)

    def contains(self, file_id: str) -> bool:
        with self._lock:
            return file_id in self._files
