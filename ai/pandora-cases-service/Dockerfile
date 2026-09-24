FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=7705
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py db.py ./
EXPOSE 7705
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7705"]
