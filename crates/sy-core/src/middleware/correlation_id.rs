//! Correlation ID middleware — attaches a UUIDv7 to every request.
//!
//! Reads `X-Correlation-ID` from the request header if present,
//! otherwise generates a new one. Sets the header on the response.

use axum::http::{HeaderValue, Request, Response};
use std::future::Future;
use std::pin::Pin;
use std::task::{Context, Poll};
use tower::{Layer, Service};

#[derive(Clone)]
pub struct CorrelationIdLayer;

impl<S> Layer<S> for CorrelationIdLayer {
    type Service = CorrelationIdMiddleware<S>;

    fn layer(&self, inner: S) -> Self::Service {
        CorrelationIdMiddleware { inner }
    }
}

#[derive(Clone)]
pub struct CorrelationIdMiddleware<S> {
    inner: S,
}

impl<S, ReqBody, ResBody> Service<Request<ReqBody>> for CorrelationIdMiddleware<S>
where
    S: Service<Request<ReqBody>, Response = Response<ResBody>> + Clone + Send + 'static,
    S::Future: Send + 'static,
    ReqBody: Send + 'static,
    ResBody: Send + 'static,
{
    type Response = S::Response;
    type Error = S::Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>> + Send>>;

    fn poll_ready(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, mut req: Request<ReqBody>) -> Self::Future {
        let correlation_id = req
            .headers()
            .get("x-correlation-id")
            .and_then(|v| v.to_str().ok())
            .map(String::from)
            .unwrap_or_else(|| uuid::Uuid::now_v7().to_string());

        if let Ok(val) = HeaderValue::from_str(&correlation_id) {
            req.headers_mut().insert("x-correlation-id", val);
        }

        let mut inner = self.inner.clone();
        let id = correlation_id.clone();

        Box::pin(async move {
            let mut resp = inner.call(req).await?;
            if let Ok(val) = HeaderValue::from_str(&id) {
                resp.headers_mut().insert("x-correlation-id", val);
            }
            Ok(resp)
        })
    }
}
