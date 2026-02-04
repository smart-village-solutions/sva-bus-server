## 1. Proxy Endpoints

- [x] 1.1 Create a proxy controller under `/api/v1` for GET and POST
- [x] 1.2 Forward path, query, JSON bodies, and configured API key via HttpClientService (header)
- [x] 1.3 Map upstream errors (non-2xx passthrough, network failures to 502)

## 2. Tests

- [x] 2.1 Unit-test proxy logic with mocked HttpClientService
- [x] 2.2 Add e2e test coverage for successful proxy and error handling

## 3. Documentation

- [x] 3.1 Document proxy endpoint usage in README
- [x] 3.2 Note limitations (no auth/rate limit yet)
