FROM python:3.12-alpine
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY common/ common/
COPY god/ god/
CMD ["python", "-m", "god.main"]
