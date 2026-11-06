FROM python:3.13-alpine
WORKDIR /app
RUN adduser -D -u 10001 stats && mkdir /data && chown stats:stats /data
COPY server.py dashboard.html ./
USER stats
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/healthz', timeout=2)" || exit 1
CMD ["python", "server.py"]
