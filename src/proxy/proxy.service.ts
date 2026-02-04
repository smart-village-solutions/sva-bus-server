import { Injectable } from '@nestjs/common';

import type { HttpClientRawResponse, HttpRequestOptions } from '../http-client/http-client.service';
import { HttpClientService } from '../http-client/http-client.service';

@Injectable()
export class ProxyService {
  constructor(private readonly httpClientService: HttpClientService) {}

  async forward<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    options?: HttpRequestOptions,
  ): Promise<HttpClientRawResponse<T>> {
    return this.httpClientService.requestRaw<T>(method, path, body, options);
  }
}
