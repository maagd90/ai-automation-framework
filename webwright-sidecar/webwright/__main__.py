from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from runner import SAFE_OUTPUT_BASE, empty_result, run_payload


class WebwrightHandler(BaseHTTPRequestHandler):
    server_version = 'WebwrightSidecar/1.0'

    def _write_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in {'/', '/health'}:
            self._write_json(200, {'ok': True})
            return
        self._write_json(404, {'ok': False, 'error': 'not found'})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != '/repair':
            self._write_json(404, {'ok': False, 'error': 'not found'})
            return

        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode('utf-8'))
        except Exception as exc:  # noqa: BLE001
            self._write_json(400, empty_result('failed', 'unknown', f'Invalid JSON payload: {exc}', [str(exc)]))
            return

        output_dir = Path(str(payload.get('outputDir') or os.environ.get('WEBWRIGHT_OUTPUT_DIR', SAFE_OUTPUT_BASE)))
        output_dir = output_dir.resolve()
        if not output_dir.is_relative_to(SAFE_OUTPUT_BASE):
            self._write_json(400, empty_result('failed', 'unknown', 'Unsafe output directory rejected', []))
            return

        output_dir.mkdir(parents=True, exist_ok=True)
        result = run_payload(payload if isinstance(payload, dict) else {}, output_dir)
        (output_dir / 'result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        self._write_json(200, result)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def main() -> None:
    port = int(os.environ.get('WEBWRIGHT_PORT', '3002'))
    server = ThreadingHTTPServer(('0.0.0.0', port), WebwrightHandler)
    server.serve_forever()


if __name__ == '__main__':
    main()
