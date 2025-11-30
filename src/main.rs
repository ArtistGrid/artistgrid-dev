use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderValue, Method, Request, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use bytes::Bytes;
use moka::future::Cache;
use reqwest::Client;
use std::time::Duration;
use tower_http::compression::CompressionLayer;
use tracing::{error, info, warn};

#[derive(Debug, Clone)]
struct Config {
    api_key: String,
    upstream_url: String,
    host: String,
    port: u16,
    cache_ttl_seconds: u64,
    cache_max_capacity: u64,
    allowed_origin_suffix: String,
    allowed_origin_exact: String,
}

impl Config {
    fn from_env() -> Result<Self, String> {
        let api_key =
            std::env::var("API_KEY").map_err(|_| "API_KEY environment variable is required")?;

        if api_key.is_empty() {
            return Err("API_KEY cannot be empty".to_string());
        }

        Ok(Self {
            api_key,
            upstream_url: std::env::var("UPSTREAM_URL")
                .unwrap_or_else(|_| "https://tracker.israeli.ovh".to_string()),
            host: std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: std::env::var("PORT")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(3000),
            cache_ttl_seconds: std::env::var("CACHE_TTL_SECONDS")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(600),
            cache_max_capacity: std::env::var("CACHE_MAX_CAPACITY")
                .ok()
                .and_then(|p| p.parse().ok())
                .unwrap_or(10_000),
            allowed_origin_suffix: std::env::var("ALLOWED_ORIGIN_SUFFIX")
                .unwrap_or_else(|_| ".artistgrid.".to_string()),
            allowed_origin_exact: std::env::var("ALLOWED_ORIGIN_EXACT")
                .unwrap_or_else(|_| "artistgrid.cx".to_string()),
        })
    }
}

#[derive(Clone)]
struct AppState {
    client: Client,
    cache: Cache<String, CachedResponse>,
    config: Config,
}

#[derive(Clone, Debug)]
struct CachedResponse {
    status: u16,
    body: Bytes,
    content_type: Option<String>,
}

fn is_allowed_origin(origin: &str, config: &Config) -> bool {
    let host = origin
        .strip_prefix("https://")
        .or_else(|| origin.strip_prefix("http://"))
        .unwrap_or(origin);

    let host = host.split(':').next().unwrap_or(host);

    host == config.allowed_origin_exact || host.ends_with(&config.allowed_origin_suffix)
}

async fn cors_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: axum::middleware::Next,
) -> Response {
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    if request.method() == Method::OPTIONS {
        if let Some(ref origin_str) = origin {
            if is_allowed_origin(origin_str, &state.config) {
                return Response::builder()
                    .status(StatusCode::NO_CONTENT)
                    .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin_str.as_str())
                    .header(header::ACCESS_CONTROL_ALLOW_METHODS, "GET, OPTIONS")
                    .header(header::ACCESS_CONTROL_ALLOW_HEADERS, "Content-Type")
                    .header(header::ACCESS_CONTROL_MAX_AGE, "86400")
                    .body(Body::empty())
                    .unwrap();
            }
        }
        return Response::builder()
            .status(StatusCode::FORBIDDEN)
            .body(Body::from("Origin not allowed"))
            .unwrap();
    }

    if let Some(ref origin_str) = origin {
        if !is_allowed_origin(origin_str, &state.config) {
            warn!("Blocked request from origin: {}", origin_str);
            return Response::builder()
                .status(StatusCode::FORBIDDEN)
                .body(Body::from("Origin not allowed"))
                .unwrap();
        }
    }

    let mut response = next.run(request).await;

    if let Some(origin_str) = origin {
        if is_allowed_origin(&origin_str, &state.config) {
            let headers = response.headers_mut();
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_ORIGIN,
                HeaderValue::from_str(&origin_str).unwrap_or_else(|_| HeaderValue::from_static("*")),
            );
            headers.insert(
                header::ACCESS_CONTROL_ALLOW_METHODS,
                HeaderValue::from_static("GET, OPTIONS"),
            );
            headers.insert(header::VARY, HeaderValue::from_static("Origin"));
        }
    }

    response
}

async fn proxy_all(State(state): State<AppState>, uri: Uri) -> impl IntoResponse {
    let path = uri.path();
    let query = uri.query().map(|q| format!("?{}", q)).unwrap_or_default();
    let cache_key = format!("{}{}", path, query);

    if let Some(cached) = state.cache.get(&cache_key).await {
        info!("Cache HIT for: {}", cache_key);
        return build_response(&cached, true, &state.config);
    }

    info!("Cache MISS for: {}", cache_key);

    let upstream_url = format!("{}{}{}", state.config.upstream_url, path, query);

    let response = match state
        .client
        .get(&upstream_url)
        .header("X-Api-Key", &state.config.api_key)
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            error!("Upstream request failed for {}: {}", path, e);
            return (
                StatusCode::BAD_GATEWAY,
                [(header::CONTENT_TYPE, "application/json")],
                r#"{"error": "Upstream request failed"}"#.to_string(),
            )
                .into_response();
        }
    };

    let status = response.status().as_u16();
    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let body = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(e) => {
            error!("Failed to read upstream response: {}", e);
            return (
                StatusCode::BAD_GATEWAY,
                [(header::CONTENT_TYPE, "application/json")],
                r#"{"error": "Failed to read response"}"#.to_string(),
            )
                .into_response();
        }
    };

    let cached = CachedResponse {
        status,
        body,
        content_type,
    };

    if status >= 200 && status < 300 {
        state.cache.insert(cache_key.clone(), cached.clone()).await;
    }

    build_response(&cached, false, &state.config)
}

fn build_response(cached: &CachedResponse, from_cache: bool, config: &Config) -> Response {
    let mut builder = Response::builder().status(cached.status);

    if let Some(ref ct) = cached.content_type {
        builder = builder.header(header::CONTENT_TYPE, ct.as_str());
    }

    let cache_status = if from_cache { "HIT" } else { "MISS" };

    builder
        .header(
            header::CACHE_CONTROL,
            format!("public, max-age={}", config.cache_ttl_seconds),
        )
        .header("X-Cache", cache_status)
        .body(Body::from(cached.body.clone()))
        .unwrap()
}

async fn local_health() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

async fn cache_stats(State(state): State<AppState>) -> impl IntoResponse {
    let stats = serde_json::json!({
        "entry_count": state.cache.entry_count(),
        "weighted_size": state.cache.weighted_size(),
        "ttl_seconds": state.config.cache_ttl_seconds,
        "max_capacity": state.config.cache_max_capacity
    });

    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, "application/json")],
        stats.to_string(),
    )
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let config = Config::from_env().unwrap_or_else(|e| {
        eprintln!("Configuration error: {}", e);
        std::process::exit(1);
    });

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("tracker_proxy=info".parse().unwrap()),
        )
        .init();

    info!("Starting tracker-proxy v{}", env!("CARGO_PKG_VERSION"));
    info!("Upstream: {}", config.upstream_url);
    info!("Cache TTL: {}s", config.cache_ttl_seconds);

    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10))
        .pool_max_idle_per_host(32)
        .pool_idle_timeout(Duration::from_secs(90))
        .tcp_keepalive(Duration::from_secs(60))
        .tcp_nodelay(true)
        .gzip(true)
        .brotli(true)
        .build()
        .expect("Failed to create HTTP client");

    let cache: Cache<String, CachedResponse> = Cache::builder()
        .max_capacity(config.cache_max_capacity)
        .time_to_live(Duration::from_secs(config.cache_ttl_seconds))
        .build();

    let state = AppState {
        client,
        cache,
        config: config.clone(),
    };

    let app = Router::new()
        .route("/_health", get(local_health))
        .route("/_stats", get(cache_stats))
        .fallback(proxy_all)
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            cors_middleware,
        ))
        .layer(CompressionLayer::new())
        .with_state(state);

    let addr: std::net::SocketAddr = format!("{}:{}", config.host, config.port)
        .parse()
        .expect("Invalid HOST:PORT");

    info!("Listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .unwrap();
}

async fn shutdown_signal() {
    tokio::signal::ctrl_c().await.ok();
    info!("Shutting down...");
}
