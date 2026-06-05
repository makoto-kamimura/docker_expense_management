# ランタイムの debian:bookworm-slim と glibc を揃えるため bookworm 版に固定
FROM rust:1.90-slim-bookworm AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Cache dependencies first (Cargo.lock pins exact versions for reproducible builds)
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && \
    cargo build --release --locked && \
    rm -rf src target/release/deps/expense_api*

COPY src ./src
RUN cargo build --release --locked

FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates libssl3 \
    tesseract-ocr tesseract-ocr-jpn tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/expense_api /usr/local/bin/expense_api

RUN mkdir -p /data/uploads
ENV UPLOAD_DIR=/data/uploads

EXPOSE 8080
CMD ["expense_api"]
