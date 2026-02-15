# gunicorn.conf.py - SSL/TLS Optimized
bind = "0.0.0.0:10000"
workers = 1
timeout = 120
keepalive = 5
max_requests = 50
max_requests_jitter = 10
worker_class = "sync"
worker_connections = 1000
limit_request_line = 4094
limit_request_fields = 100
limit_request_field_size = 8190

# SSL/TLS optimizations
worker_tmp_dir = "/dev/shm"  # Use RAM for temp files
graceful_timeout = 30
preload_app = True  # Preload app to reduce memory
