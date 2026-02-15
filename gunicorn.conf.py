# gunicorn.conf.py
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
