import logging
import queue
import threading

logger = logging.getLogger(__name__)


class TaskManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._tasks: dict[str, dict] = {}

    def create(self, task_id: str, data: dict) -> None:
        with self._lock:
            self._tasks[task_id] = data

    def get(self, task_id: str) -> dict | None:
        with self._lock:
            return self._tasks.get(task_id)

    def update(self, task_id: str, key: str, value) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False
            self._tasks[task_id][key] = value
            return True

    def contains(self, task_id: str) -> bool:
        with self._lock:
            return task_id in self._tasks

    def create_extraction_task(self, task_id: str) -> queue.Queue:
        q: queue.Queue = queue.Queue()
        self.create(task_id, {'queue': q, 'status': 'running'})
        return q

    def create_annotate_task(self, task_id: str) -> queue.Queue:
        q: queue.Queue = queue.Queue()
        self.create(task_id, {'status': 'processing', 'queue': q})
        return q

    def is_paused(self, task_id: str) -> bool:
        task = self.get(task_id)
        return bool(task and task.get('paused'))

    def is_cancelled(self, task_id: str) -> bool:
        task = self.get(task_id)
        return bool(task and task.get('cancelled'))

    def cancel(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False
            self._tasks[task_id]['cancelled'] = True
            self._tasks[task_id]['paused'] = False
            return True

    def pause(self, task_id: str) -> bool:
        return self.update(task_id, 'paused', True)

    def resume(self, task_id: str) -> bool:
        return self.update(task_id, 'paused', False)


import os
import time

class AnnotatedFileStore:
    def __init__(self, ttl_seconds: int = 3600):
        self._lock = threading.Lock()
        self._files: dict[str, dict] = {}
        self._ttl = ttl_seconds

    def _cleanup(self) -> None:
        now = time.time()
        expired = [fid for fid, info in self._files.items() if now - info.get('created_at', now) > self._ttl]
        for fid in expired:
            info = self._files.pop(fid, None)
            if info and os.path.exists(info['path']):
                try:
                    os.remove(info['path'])
                except Exception:
                    logger.error("Failed to delete an expired annotated file.")

    def put(self, file_id: str, path: str, filename: str) -> None:
        with self._lock:
            self._cleanup()
            self._files[file_id] = {
                'path': path,
                'filename': filename,
                'created_at': time.time()
            }

    def get(self, file_id: str) -> dict | None:
        with self._lock:
            self._cleanup()
            return self._files.get(file_id)

    def pop(self, file_id: str) -> dict | None:
        with self._lock:
            return self._files.pop(file_id, None)

    def contains(self, file_id: str) -> bool:
        with self._lock:
            return file_id in self._files
