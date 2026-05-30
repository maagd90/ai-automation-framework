FROM mcr.microsoft.com/playwright/python:v1.59.1-jammy

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV WEBWRIGHT_OUTPUT_DIR=/tmp/jobs/webwright
ENV WEBWRIGHT_DOCKER_ONLY=true
ENV WEBWRIGHT_PORT=3002

COPY webwright-sidecar/requirements.txt ./webwright-sidecar/requirements.txt
RUN pip install --no-cache-dir -r ./webwright-sidecar/requirements.txt

COPY webwright-sidecar/runner.py ./runner.py
COPY webwright-sidecar/webwright ./webwright

EXPOSE 3002

CMD ["python", "-m", "webwright"]
